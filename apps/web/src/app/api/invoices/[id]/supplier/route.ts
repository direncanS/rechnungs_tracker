import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireRole("ACCOUNTANT", { verifyFromDb: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await params;

  let body: { supplierId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { supplierId } = body;

  if (!supplierId || typeof supplierId !== "string") {
    return NextResponse.json(
      { error: "supplierId is required" },
      { status: 400 }
    );
  }

  // Check invoice exists and is in reviewable state
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, processingStatus: true, reviewStatus: true, supplierId: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.processingStatus !== "PARSED" || invoice.reviewStatus !== "NEEDS_REVIEW") {
    return NextResponse.json(
      { error: "Invoice is not in a reviewable state" },
      { status: 409 }
    );
  }

  // Check supplier exists
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency
    const updated = await tx.invoice.updateMany({
      where: { id, reviewStatus: "NEEDS_REVIEW" },
      data: { supplierId },
    });

    if (updated.count === 0) {
      throw new Error("REVIEW_CONFLICT");
    }

    const review = await tx.invoiceReview.create({
      data: {
        action: "EDITED",
        comment: null,
        changes: {
          supplierId,
          previousSupplierId: invoice.supplierId,
        },
        invoiceId: id,
        reviewedById: session.user.id,
      },
      select: {
        id: true,
        action: true,
        changes: true,
        createdAt: true,
      },
    });

    return review;
  });

  return NextResponse.json({
    ...result,
    invoice: { id, supplierId },
  });
}
