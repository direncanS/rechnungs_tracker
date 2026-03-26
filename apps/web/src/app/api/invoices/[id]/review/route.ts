import { NextResponse } from "next/server";
import { Prisma, ReviewAction } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const VALID_ACTIONS = Object.values(ReviewAction);

const EDITABLE_INVOICE_FIELDS = [
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "subtotal",
  "taxAmount",
  "totalAmount",
  "currency",
  "notes",
];

export async function POST(
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

  let body: { action?: string; comment?: string; changes?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, comment, changes } = body;

  if (!action || !VALID_ACTIONS.includes(action as ReviewAction)) {
    return NextResponse.json(
      { error: `Invalid action: must be one of ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (action === "REJECTED" && (!comment || !comment.trim())) {
    return NextResponse.json(
      { error: "Comment is required for REJECTED action" },
      { status: 400 }
    );
  }

  if (action === "EDITED") {
    if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
      return NextResponse.json(
        { error: "Changes object is required for EDITED action" },
        { status: 400 }
      );
    }
    const invalidKeys = Object.keys(changes).filter(
      (k) => !EDITABLE_INVOICE_FIELDS.includes(k)
    );
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: `Invalid change fields: ${invalidKeys.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Check invoice exists and is in reviewable state
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, processingStatus: true, reviewStatus: true },
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

  // Determine new reviewStatus
  const newReviewStatus =
    action === "APPROVED" ? "VERIFIED" : action === "REJECTED" ? "REJECTED" : "NEEDS_REVIEW";

  // Build update data for EDITED
  const invoiceUpdateData: Record<string, unknown> = { reviewStatus: newReviewStatus };
  if (action === "EDITED" && changes) {
    for (const [key, value] of Object.entries(changes)) {
      invoiceUpdateData[key] = value;
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Optimistic concurrency: only update if still NEEDS_REVIEW
      const updated = await tx.invoice.updateMany({
        where: { id, reviewStatus: "NEEDS_REVIEW" },
        data: invoiceUpdateData,
      });

      if (updated.count === 0) {
        throw new Error("REVIEW_CONFLICT");
      }

      const review = await tx.invoiceReview.create({
        data: {
          action: action as ReviewAction,
          comment: comment?.trim() || null,
          changes: action === "EDITED" ? (changes as Prisma.InputJsonValue) : Prisma.DbNull,
          invoiceId: id,
          reviewedById: session.user.id,
        },
        select: {
          id: true,
          action: true,
          comment: true,
          changes: true,
          createdAt: true,
        },
      });

      return review;
    });

    return NextResponse.json({
      ...result,
      invoice: { id, reviewStatus: newReviewStatus },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "REVIEW_CONFLICT") {
      return NextResponse.json(
        { error: "Review conflict: invoice state changed concurrently" },
        { status: 409 }
      );
    }
    throw err;
  }
}
