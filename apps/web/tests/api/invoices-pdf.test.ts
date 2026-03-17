import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(),
    },
  },
}));

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}));
vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
  default: { readFile: mockReadFile },
}));

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/invoices/[id]/pdf/route";

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

const mockInvoiceRecord = {
  id: "inv1",
  filePath: "/app/storage/uploads/abc123.pdf",
  originalFilename: "Rechnung-2026.pdf",
  uploadedById: "u1",
};

function callGET(id: string) {
  const request = new Request(`http://localhost/api/invoices/${id}/pdf`);
  return GET(request, { params: Promise.resolve({ id }) });
}

describe("GET /api/invoices/:id/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await callGET("inv1");
    expect(response.status).toBe(401);
  });

  it("returns 200 with correct headers on happy path", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(
      mockInvoiceRecord as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never
    );
    const pdfBuffer = Buffer.from("%PDF-1.4 test content");
    mockReadFile.mockResolvedValue(pdfBuffer);

    const response = await callGET("inv1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Rechnung-2026.pdf"'
    );
    expect(response.headers.get("Content-Length")).toBe(String(pdfBuffer.length));
  });

  it("returns 404 when invoice not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callGET("nonexistent");
    expect(response.status).toBe(404);
  });

  it("returns 403 when WORKER tries to access another user's PDF", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ id: "u1", role: "WORKER" }));
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      ...mockInvoiceRecord,
      uploadedById: "u2",
    } as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never);
    const response = await callGET("inv1");
    expect(response.status).toBe(403);
  });

  it("returns 404 when file missing on disk (ENOENT) without leaking path", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(
      mockInvoiceRecord as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never
    );
    const enoentError = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
    });
    mockReadFile.mockRejectedValue(enoentError);

    const response = await callGET("inv1");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).not.toContain("/app/storage");
    expect(body.error).not.toContain("abc123");
  });

  it("returns 500 on unexpected I/O error without leaking path", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(
      mockInvoiceRecord as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never
    );
    const ioError = Object.assign(new Error("EACCES: permission denied"), {
      code: "EACCES",
    });
    mockReadFile.mockRejectedValue(ioError);

    const response = await callGET("inv1");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("/app/storage");
    expect(body.error).not.toContain("abc123");
  });
});
