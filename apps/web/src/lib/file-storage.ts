import { createHash } from "crypto";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { MAX_FILE_SIZE_BYTES, PDF_MAGIC_BYTES } from "@/lib/constants";

export function validatePdf(buffer: Buffer): void {
  const header = buffer.subarray(0, PDF_MAGIC_BYTES.length).toString("ascii");
  if (header !== PDF_MAGIC_BYTES) {
    throw new Error("Invalid PDF: missing magic bytes");
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large: ${buffer.length} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`
    );
  }
}

export function calculateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function saveFile(
  buffer: Buffer,
  uploadDir: string,
  storedFilename: string
): Promise<{ filePath: string; fileSizeBytes: number }> {
  const resolvedDir = path.resolve(uploadDir);
  const resolvedPath = path.resolve(uploadDir, storedFilename);

  if (
    !resolvedPath.startsWith(resolvedDir + path.sep) &&
    resolvedPath !== resolvedDir
  ) {
    throw new Error("Path traversal detected");
  }

  await writeFile(resolvedPath, buffer);
  return { filePath: resolvedPath, fileSizeBytes: buffer.length };
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // best-effort: swallow errors for orphan cleanup
  }
}
