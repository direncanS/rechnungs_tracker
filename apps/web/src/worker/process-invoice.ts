import { Job, UnrecoverableError } from "bullmq";
import { prisma } from "@/lib/prisma";

const PARSER_URL = process.env.PARSER_URL ?? "http://parser:8000";

export async function processInvoice(job: Job<{ invoiceId: string }>) {
  const { invoiceId } = job.data;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, filePath: true },
  });

  if (!invoice) {
    throw new UnrecoverableError(`Invoice ${invoiceId} not found in DB`);
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { processingStatus: "PROCESSING" },
  });

  let response: Response;
  try {
    response = await fetch(`${PARSER_URL}/api/v1/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: invoice.filePath }),
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Network error";
    if (job.attemptsMade >= 2) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          processingStatus: "FAILED_PARSE",
          parseError: errorMsg,
        },
      });
      return;
    }
    throw e;
  }

  if (!response.ok) {
    const errorMsg = `Parser returned HTTP ${response.status}`;
    if (job.attemptsMade >= 2) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          processingStatus: "FAILED_PARSE",
          parseError: errorMsg,
        },
      });
      return;
    }
    throw new Error(errorMsg);
  }

  const body = await response.json();

  if (body.success !== true) {
    const errorMsg = body.error ?? "Parser returned success=false";
    if (job.attemptsMade >= 2) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          processingStatus: "FAILED_PARSE",
          parseError: errorMsg,
        },
      });
      return;
    }
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { parseError: errorMsg },
    });
    throw new Error(errorMsg);
  }

  const supplierName: string = body.supplier_name ?? "Unknown";
  const normalizedName = supplierName.toLowerCase().trim();

  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.upsert({
      where: { normalizedName },
      create: {
        name: supplierName,
        normalizedName,
        address: body.supplier_address ?? null,
        taxId: body.supplier_tax_id ?? null,
      },
      update: {},
    });

    await tx.invoiceItem.deleteMany({ where: { invoiceId } });

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber: body.invoice_number ?? null,
        invoiceDate: body.invoice_date ? new Date(body.invoice_date) : null,
        dueDate: body.due_date ? new Date(body.due_date) : null,
        subtotal: body.subtotal ?? null,
        taxAmount: body.tax_amount ?? null,
        totalAmount: body.total_amount ?? null,
        currency: body.currency ?? "EUR",
        parserVersion: body.parser_version ?? null,
        parserConfidence: body.confidence ?? null,
        parserRawOutput: body,
        parseError: null,
        processingStatus: "PARSED",
        reviewStatus: "NEEDS_REVIEW",
        supplierId: supplier.id,
      },
    });

    const items = body.items ?? [];
    if (items.length > 0) {
      await tx.invoiceItem.createMany({
        data: items.map(
          (
            item: {
              description?: string;
              quantity?: number;
              unit?: string;
              unit_price?: number;
              total_price?: number;
              tax_rate?: number;
            },
            idx: number
          ) => ({
            invoiceId,
            lineNumber: idx + 1,
            description: item.description ?? "",
            quantity: item.quantity ?? 1,
            unit: item.unit ?? null,
            unitPrice: item.unit_price ?? 0,
            totalPrice: item.total_price ?? 0,
            taxRate: item.tax_rate ?? null,
          })
        ),
      });
    }
  });
}
