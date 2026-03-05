import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function sanitizeParseError(error: string): string {
  return error.replace(
    /(?:\/(?:app|tmp)\/[^\s"']*|[A-Z]:\\[^\s"']*)/gi,
    "[path]"
  );
}

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
      processingStatus: true,
      reviewStatus: true,
      parseError: true,
      uploadedById: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = session.user.role as string;
  if (role === "WORKER" && invoice.uploadedById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response: {
    id: string;
    processingStatus: string;
    reviewStatus: string;
    parseError?: string;
  } = {
    id: invoice.id,
    processingStatus: invoice.processingStatus,
    reviewStatus: invoice.reviewStatus,
  };

  if (invoice.parseError) {
    response.parseError = sanitizeParseError(invoice.parseError);
  }

  return NextResponse.json(response);
}
