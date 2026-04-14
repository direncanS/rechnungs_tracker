import { ProcessingStatus, ReviewStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { MAX_EXPORT_ROWS } from "@/lib/constants";
import { formatCsvHeader, formatCsvRow } from "@/lib/csv-export";

const VALID_PROCESSING_STATUSES = Object.values(ProcessingStatus);
const VALID_REVIEW_STATUSES = Object.values(ReviewStatus);

const CSV_HEADERS = [
  "Invoice Number",
  "Invoice Date",
  "Due Date",
  "Supplier",
  "Total Amount",
  "Subtotal",
  "Tax Amount",
  "Currency",
  "Processing Status",
  "Review Status",
  "Uploaded By",
  "Created At",
];

function dateToString(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

function decimalToString(d: unknown): string {
  if (d === null || d === undefined) return "";
  return String(d);
}

export async function GET(request: Request) {
  try {
    await requireRole("OWNER", { verifyFromDb: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { searchParams } = new URL(request.url);

  // Validate enum filters
  const processingStatus = searchParams.get("processingStatus");
  if (
    processingStatus &&
    !VALID_PROCESSING_STATUSES.includes(processingStatus as ProcessingStatus)
  ) {
    return new Response(
      JSON.stringify({ error: `Invalid processingStatus: ${processingStatus}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const reviewStatus = searchParams.get("reviewStatus");
  if (
    reviewStatus &&
    !VALID_REVIEW_STATUSES.includes(reviewStatus as ReviewStatus)
  ) {
    return new Response(
      JSON.stringify({ error: `Invalid reviewStatus: ${reviewStatus}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Build where clause
  const where: Record<string, unknown> = { deletedAt: null };
  if (processingStatus) where.processingStatus = processingStatus;
  if (reviewStatus) where.reviewStatus = reviewStatus;

  const invoices = await prisma.invoice.findMany({
    where,
    select: {
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      supplier: { select: { name: true } },
      totalAmount: true,
      subtotal: true,
      taxAmount: true,
      currency: true,
      processingStatus: true,
      reviewStatus: true,
      uploadedBy: { select: { name: true } },
      createdAt: true,
    },
    take: MAX_EXPORT_ROWS,
    orderBy: { createdAt: "desc" },
  });

  let csv = formatCsvHeader(CSV_HEADERS);

  for (const inv of invoices) {
    csv += formatCsvRow([
      inv.invoiceNumber ?? "",
      dateToString(inv.invoiceDate),
      dateToString(inv.dueDate),
      inv.supplier?.name ?? "",
      decimalToString(inv.totalAmount),
      decimalToString(inv.subtotal),
      decimalToString(inv.taxAmount),
      inv.currency,
      inv.processingStatus,
      inv.reviewStatus,
      inv.uploadedBy.name,
      inv.createdAt.toISOString(),
    ]);
  }

  const today = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="invoices-export-${today}.csv"`,
    },
  });
}
