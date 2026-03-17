import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/invoices/route";

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

const mockInvoice = {
  id: "inv1",
  invoiceNumber: "INV-001",
  invoiceDate: new Date("2026-01-15"),
  originalFilename: "test.pdf",
  processingStatus: "PARSED",
  reviewStatus: "NEEDS_REVIEW",
  totalAmount: 100.0,
  currency: "EUR",
  createdAt: new Date(),
  updatedAt: new Date(),
  supplier: { id: "s1", name: "ACME" },
  uploadedBy: { id: "u1", name: "Worker" },
};

function callGET(query = "") {
  const url = `http://localhost/api/invoices${query ? `?${query}` : ""}`;
  return GET(new Request(url));
}

describe("GET /api/invoices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([mockInvoice] as never);
    vi.mocked(prisma.invoice.count).mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await callGET();
    expect(response.status).toBe(401);
  });

  it("WORKER sees own invoices only (uploadedById filter applied)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ id: "u1", role: "WORKER" }));
    await callGET();
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ uploadedById: "u1", deletedAt: null }),
      })
    );
  });

  it("ACCOUNTANT sees all invoices (no uploadedById filter)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ id: "u2", role: "ACCOUNTANT" }));
    await callGET();
    const call = vi.mocked(prisma.invoice.findMany).mock.calls[0][0];
    expect(call?.where).not.toHaveProperty("uploadedById");
    expect(call?.where).toHaveProperty("deletedAt", null);
  });

  it("uses default pagination page=1, pageSize=20", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    await callGET();
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it("respects custom page and pageSize", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    await callGET("page=3&pageSize=10");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it("returns 400 for invalid page (0)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET("page=0");
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid page (negative)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET("page=-1");
    expect(response.status).toBe(400);
  });

  it("returns 400 for non-numeric page", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET("page=abc");
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid pageSize (non-numeric)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET("pageSize=xyz");
    expect(response.status).toBe(400);
  });

  it("clamps pageSize to MAX_PAGE_SIZE when exceeded", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    await callGET("pageSize=500");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("filters by processingStatus", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    await callGET("processingStatus=PARSED");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ processingStatus: "PARSED" }),
      })
    );
  });

  it("filters by reviewStatus", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    await callGET("reviewStatus=NEEDS_REVIEW");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reviewStatus: "NEEDS_REVIEW" }),
      })
    );
  });

  it("returns 400 for invalid processingStatus", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET("processingStatus=BOGUS");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("BOGUS");
  });

  it("returns 400 for invalid reviewStatus", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET("reviewStatus=BOGUS");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("BOGUS");
  });

  it("filters by supplierId", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    await callGET("supplierId=s1");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supplierId: "s1" }),
      })
    );
  });

  it("returns correct pagination metadata", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    vi.mocked(prisma.invoice.count).mockResolvedValue(45);
    const response = await callGET("page=2&pageSize=10");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({
      page: 2,
      pageSize: 10,
      totalCount: 45,
      totalPages: 5,
    });
  });

  it("never exposes sensitive fields in response", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ role: "ACCOUNTANT" }));
    const response = await callGET();
    const body = await response.json();
    expect(response.status).toBe(200);
    // Check the select passed to findMany does not include sensitive fields
    const selectArg = vi.mocked(prisma.invoice.findMany).mock.calls[0][0]?.select;
    expect(selectArg).not.toHaveProperty("filePath");
    expect(selectArg).not.toHaveProperty("fileHash");
    expect(selectArg).not.toHaveProperty("storedFilename");
    expect(selectArg).not.toHaveProperty("parserRawOutput");
    expect(selectArg).not.toHaveProperty("deletedAt");
    expect(selectArg).not.toHaveProperty("parseError");
    // Also check response shape
    expect(body.items[0]).not.toHaveProperty("filePath");
    expect(body.items[0]).not.toHaveProperty("fileHash");
    expect(body.items[0]).not.toHaveProperty("storedFilename");
    expect(body.items[0]).not.toHaveProperty("parserRawOutput");
    expect(body.items[0]).not.toHaveProperty("deletedAt");
  });
});
