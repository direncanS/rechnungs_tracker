import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";

// Mock auth-helpers
vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock file-storage
vi.mock("@/lib/file-storage", () => ({
  validatePdf: vi.fn(),
  calculateFileHash: vi.fn(),
  saveFile: vi.fn(),
  deleteFile: vi.fn(),
}));

// Mock queue
vi.mock("@/lib/queue", () => ({
  enqueueParseJob: vi.fn(),
}));

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  validatePdf,
  calculateFileHash,
  saveFile,
  deleteFile,
} from "@/lib/file-storage";
import { enqueueParseJob } from "@/lib/queue";
import { POST } from "@/app/api/invoices/upload/route";

function makeSession(overrides?: Partial<Session["user"]>): Session {
  return {
    user: {
      id: "u1",
      email: "worker@test.com",
      name: "Worker",
      role: "WORKER",
      ...overrides,
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

function makeFileBlob(name = "invoice.pdf") {
  const buffer = Buffer.from("%PDF-1.4 test content");
  const blob = new Blob([buffer], { type: "application/pdf" });
  Object.defineProperty(blob, "name", { value: name, writable: false });
  Object.defineProperty(blob, "arrayBuffer", {
    value: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
  });
  return blob;
}

function makePdfRequest(filename = "invoice.pdf"): NextRequest {
  const file = makeFileBlob(filename);
  return {
    formData: () =>
      Promise.resolve({
        get: (key: string) => (key === "file" ? file : null),
      }),
  } as unknown as NextRequest;
}

function makeEmptyFormRequest(): NextRequest {
  return {
    formData: () =>
      Promise.resolve({
        get: () => null,
      }),
  } as unknown as NextRequest;
}

describe("POST /api/invoices/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(calculateFileHash).mockReturnValue("abc123hash");
    vi.mocked(saveFile).mockResolvedValue({
      filePath: "/app/storage/uploads/test.pdf",
      fileSizeBytes: 1024,
    });
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.invoice.create).mockResolvedValue({
      id: "inv1",
      processingStatus: "UPLOADED",
      reviewStatus: "PENDING",
    } as ReturnType<typeof prisma.invoice.create> extends Promise<infer T>
      ? T
      : never);
    vi.mocked(enqueueParseJob).mockResolvedValue(undefined);
    vi.mocked(prisma.invoice.update).mockResolvedValue(
      {} as ReturnType<typeof prisma.invoice.update> extends Promise<infer T>
        ? T
        : never
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(401);
  });

  it("propagates non-Response errors from requireRole", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Error("DB connection failed")
    );
    await expect(POST(makePdfRequest())).rejects.toThrow(
      "DB connection failed"
    );
  });

  it("allows WORKER to upload → 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "WORKER" }));
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(201);
  });

  it("allows ACCOUNTANT to upload → 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(
      makeSession({ role: "ACCOUNTANT" })
    );
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(201);
  });

  it("allows OWNER to upload → 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "OWNER" }));
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(201);
  });

  it("returns correct response shape on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await POST(makePdfRequest());
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toHaveProperty("id", "inv1");
    expect(body).toHaveProperty("processingStatus");
    expect(body).toHaveProperty("reviewStatus");
  });

  it("returns 400 when file is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await POST(makeEmptyFormRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/missing file/i);
  });

  it("returns 400 for non-PDF extension", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await POST(makePdfRequest("document.docx"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/pdf/i);
  });

  it("returns 400 when PDF magic bytes are invalid", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(validatePdf).mockImplementation(() => {
      throw new Error("Invalid PDF: missing magic bytes");
    });
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(400);
  });

  it("returns 409 for duplicate hash (findFirst hit)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "existing-inv",
    } as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T>
      ? T
      : never);
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/duplicate/i);
  });

  it("returns 409 for duplicate hash (DB unique constraint race)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const prismaError = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["fileHash"] },
    });
    vi.mocked(prisma.invoice.create).mockRejectedValue(prismaError);
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(409);
  });

  it("never exposes sensitive fields in response", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await POST(makePdfRequest());
    const body = await response.json();
    expect(body).not.toHaveProperty("filePath");
    expect(body).not.toHaveProperty("fileHash");
    expect(body).not.toHaveProperty("storedFilename");
    expect(body).not.toHaveProperty("parserRawOutput");
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("deletedAt");
  });

  it("returns 201 with UPLOADED status when enqueue fails", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(enqueueParseJob).mockRejectedValue(new Error("Redis down"));
    const response = await POST(makePdfRequest());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.processingStatus).toBe("UPLOADED");
  });

  it("calls deleteFile for orphan cleanup on DB create failure", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.create).mockRejectedValue(new Error("DB error"));
    await expect(POST(makePdfRequest())).rejects.toThrow("DB error");
    expect(deleteFile).toHaveBeenCalledWith(
      "/app/storage/uploads/test.pdf"
    );
  });
});
