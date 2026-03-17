import { NextResponse } from "next/server";
import { ProcessingStatus, ReviewStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "@/lib/constants";

const VALID_PROCESSING_STATUSES = Object.values(ProcessingStatus);
const VALID_REVIEW_STATUSES = Object.values(ReviewStatus);

export async function GET(request: Request) {
  let session;
  try {
    session = await requireRole("WORKER");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { searchParams } = new URL(request.url);

  // Parse pagination
  const pageRaw = searchParams.get("page") ?? "1";
  const pageSizeRaw = searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE);

  const page = parseInt(pageRaw, 10);
  if (isNaN(page) || page < 1) {
    return NextResponse.json(
      { error: "Invalid page: must be a positive integer" },
      { status: 400 }
    );
  }

  let pageSize = parseInt(pageSizeRaw, 10);
  if (isNaN(pageSize) || pageSize < 1) {
    return NextResponse.json(
      { error: "Invalid pageSize: must be a positive integer" },
      { status: 400 }
    );
  }
  if (pageSize > MAX_PAGE_SIZE) {
    pageSize = MAX_PAGE_SIZE;
  }

  // Validate enum filters
  const processingStatus = searchParams.get("processingStatus");
  if (
    processingStatus &&
    !VALID_PROCESSING_STATUSES.includes(processingStatus as ProcessingStatus)
  ) {
    return NextResponse.json(
      { error: `Invalid processingStatus: ${processingStatus}` },
      { status: 400 }
    );
  }

  const reviewStatus = searchParams.get("reviewStatus");
  if (
    reviewStatus &&
    !VALID_REVIEW_STATUSES.includes(reviewStatus as ReviewStatus)
  ) {
    return NextResponse.json(
      { error: `Invalid reviewStatus: ${reviewStatus}` },
      { status: 400 }
    );
  }

  const supplierId = searchParams.get("supplierId");

  // Build where clause
  const where: Record<string, unknown> = { deletedAt: null };

  const role = session.user.role as string;
  if (role === "WORKER") {
    where.uploadedById = session.user.id;
  }

  if (processingStatus) {
    where.processingStatus = processingStatus;
  }
  if (reviewStatus) {
    where.reviewStatus = reviewStatus;
  }
  if (supplierId) {
    where.supplierId = supplierId;
  }

  const [items, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        originalFilename: true,
        processingStatus: true,
        reviewStatus: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        supplier: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.count({ where }),
  ]);

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
}
