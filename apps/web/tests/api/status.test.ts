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

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/invoices/[id]/status/route";

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

function callGET(id: string) {
  const request = new Request(`http://localhost/api/invoices/${id}/status`);
  return GET(request, { params: Promise.resolve({ id }) });
}

describe("GET /api/invoices/:id/status", () => {
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

  it("returns 200 with correct shape on happy path", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "PARSED",
      reviewStatus: "NEEDS_REVIEW",
      parseError: null,
      uploadedById: "u1",
    } as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never);
    const response = await callGET("inv1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      id: "inv1",
      processingStatus: "PARSED",
      reviewStatus: "NEEDS_REVIEW",
    });
  });

  it("returns 404 when invoice not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callGET("nonexistent");
    expect(response.status).toBe(404);
  });

  it("returns 404 for soft-deleted invoice (findFirst filters deletedAt)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callGET("deleted-inv");
    expect(response.status).toBe(404);
    // Verify findFirst was called with deletedAt: null filter
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });

  it("returns 403 when WORKER tries to access another user's invoice", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ id: "u1", role: "WORKER" }));
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "UPLOADED",
      reviewStatus: "PENDING",
      parseError: null,
      uploadedById: "u2", // different user
    } as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never);
    const response = await callGET("inv1");
    expect(response.status).toBe(403);
  });

  it("allows ACCOUNTANT to see any invoice → 200", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ id: "u2", role: "ACCOUNTANT" }));
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "PARSED",
      reviewStatus: "NEEDS_REVIEW",
      parseError: null,
      uploadedById: "u1", // different user
    } as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never);
    const response = await callGET("inv1");
    expect(response.status).toBe(200);
  });

  it("sanitizes parseError to remove internal paths", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "FAILED_PARSE",
      reviewStatus: "PENDING",
      parseError: "Failed to read /app/storage/uploads/abc.pdf and C:\\Users\\admin\\file.pdf",
      uploadedById: "u1",
    } as ReturnType<typeof prisma.invoice.findFirst> extends Promise<infer T> ? T : never);
    const response = await callGET("inv1");
    const body = await response.json();
    expect(body.parseError).not.toContain("/app/storage");
    expect(body.parseError).not.toContain("C:\\Users");
    expect(body.parseError).toContain("[path]");
  });
});
