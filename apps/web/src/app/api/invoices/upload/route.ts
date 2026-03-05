import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  validatePdf,
  calculateFileHash,
  saveFile,
  deleteFile,
} from "@/lib/file-storage";
import { enqueueParseJob } from "@/lib/queue";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/app/storage/uploads";

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("WORKER");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const originalFilename = "name" in file && typeof file.name === "string" ? file.name : "upload.pdf";
  if (!originalFilename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    validatePdf(buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid PDF";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const fileHash = calculateFileHash(buffer);

  const existing = await prisma.invoice.findFirst({
    where: { fileHash },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Duplicate file: this PDF has already been uploaded" },
      { status: 409 }
    );
  }

  const storedFilename = createId() + ".pdf";
  const { filePath, fileSizeBytes } = await saveFile(
    buffer,
    UPLOAD_DIR,
    storedFilename
  );

  let invoice;
  try {
    invoice = await prisma.invoice.create({
      data: {
        originalFilename,
        storedFilename,
        filePath,
        fileHash,
        fileSizeBytes,
        uploadedById: session.user.id,
      },
      select: {
        id: true,
        processingStatus: true,
        reviewStatus: true,
      },
    });
  } catch (e) {
    await deleteFile(filePath);
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      e.code === "P2002" &&
      "meta" in e &&
      e.meta &&
      typeof e.meta === "object" &&
      "target" in e.meta &&
      Array.isArray(e.meta.target) &&
      e.meta.target.includes("fileHash")
    ) {
      return NextResponse.json(
        { error: "Duplicate file: this PDF has already been uploaded" },
        { status: 409 }
      );
    }
    throw e;
  }

  try {
    await enqueueParseJob(invoice.id);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { processingStatus: "QUEUED" },
    });
    invoice.processingStatus = "QUEUED";
  } catch (e) {
    console.error("Failed to enqueue parse job:", e);
    // Leave as UPLOADED — job can be retried later
  }

  return NextResponse.json(
    {
      id: invoice.id,
      processingStatus: invoice.processingStatus,
      reviewStatus: invoice.reviewStatus,
    },
    { status: 201 }
  );
}
