import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function sanitizeFilename(original: string): string {
  let name = original.replace(/[^\w\s.\-()]/g, "_").trim();
  if (name.length > 200) {
    name = name.slice(0, 200);
  }
  if (!name || name === ".pdf") {
    return "invoice.pdf";
  }
  if (!name.toLowerCase().endsWith(".pdf")) {
    name += ".pdf";
  }
  return name;
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
      filePath: true,
      originalFilename: true,
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

  let buffer: Buffer;
  try {
    buffer = await readFile(invoice.filePath);
  } catch (err: unknown) {
    const isEnoent =
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT";
    if (isEnoent) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  const filename = sanitizeFilename(invoice.originalFilename);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
