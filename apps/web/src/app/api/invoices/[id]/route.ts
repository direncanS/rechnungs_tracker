import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireRole("WORKER");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      currency: true,
      originalFilename: true,
      processingStatus: true,
      reviewStatus: true,
      parserVersion: true,
      parserConfidence: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      uploadedById: true,
      supplier: { select: { id: true, name: true, address: true } },
      uploadedBy: { select: { id: true, name: true, email: true } },
      items: {
        select: {
          id: true,
          lineNumber: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalPrice: true,
          taxRate: true,
          isEdited: true,
          editedFields: true,
        },
      },
      reviews: {
        select: {
          id: true,
          action: true,
          comment: true,
          changes: true,
          createdAt: true,
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = session.user.role as string;
  if (role === "WORKER" && invoice.uploadedById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Strip uploadedById from response (used only for auth check)
  const { uploadedById: _, ...responseData } = invoice;
  return NextResponse.json(responseData);
}
