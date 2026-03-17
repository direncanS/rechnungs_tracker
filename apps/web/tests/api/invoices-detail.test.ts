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
import { GET } from "@/app/api/invoices/[id]/route";

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

const mockInvoiceDetail = {
  id: "inv1",
  invoiceNumber: "INV-001",
  invoiceDate: new Date("2026-01-15"),
  dueDate: new Date("2026-02-15"),
  subtotal: 84.03,
  taxAmount: 15.97,
  totalAmount: 100.0,
  currency: "EUR",
  originalFilename: "test.pdf",
  processingStatus: "PARSED",
  reviewStatus: "NEEDS_REVIEW",
  parserVersion: "1.0.0",
  parserConfidence: 0.85,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  uploadedById: "u1",
  supplier: { id: "s1", name: "ACME", address: "123 Main St" },
  uploadedBy: { id: "u1", name: "Worker", email: "worker@test.com" },
  items: [
    {
      id: "item1",
      lineNumber: 1,
      description: "Widget",
      quantity: 2,
      unit: "pcs",
      unitPrice: 42.015,
      totalPrice: 84.03,
      taxRate: 19.0,
      isEdited: false,
      editedFields: null,
    },
  ],
  reviews: [
    {
      id: "rev1",
      action: "EDITED",
      comment: null,
      changes: { notes: "fixed amount" },
      createdAt: new Date(),
      reviewedBy: { id: "u2", name: "Accountant" },
    },
  ],
};

function callGET(id: string) {
  const request = new Request(`http://localhost/api/invoices/${id}`);
  return GET(request, { params: Promise.resolve({ id }) });
}

describe("GET /api/invoices/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await callGET("inv1");
    expect(response.status).toBe(401);
  });

  it("returns 200 with correct shape including items and reviews", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(
      mockInvoiceDetail as never
    );
    const response = await callGET("inv1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("inv1");
    expect(body.supplier).toEqual({ id: "s1", name: "ACME", address: "123 Main St" });
    expect(body.uploadedBy).toEqual({ id: "u1", name: "Worker", email: "worker@test.com" });
    expect(body.items).toHaveLength(1);
    expect(body.items[0].description).toBe("Widget");
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].reviewedBy).toEqual({ id: "u2", name: "Accountant" });
  });

  it("returns 404 when invoice not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callGET("nonexistent");
    expect(response.status).toBe(404);
  });

  it("returns 404 for soft-deleted invoice", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callGET("deleted-inv");
    expect(response.status).toBe(404);
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });

  it("returns 403 when WORKER tries to access another user's invoice", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession({ id: "u1", role: "WORKER" }));
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      ...mockInvoiceDetail,
      uploadedById: "u2",
    } as never);
    const response = await callGET("inv1");
    expect(response.status).toBe(403);
  });

  it("never exposes sensitive fields in response", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(
      mockInvoiceDetail as never
    );
    const response = await callGET("inv1");
    const body = await response.json();
    expect(body).not.toHaveProperty("filePath");
    expect(body).not.toHaveProperty("fileHash");
    expect(body).not.toHaveProperty("storedFilename");
    expect(body).not.toHaveProperty("parserRawOutput");
    expect(body).not.toHaveProperty("deletedAt");
    expect(body).not.toHaveProperty("parseError");
    expect(body).not.toHaveProperty("uploadedById");
    // Check select arg passed to Prisma
    const selectArg = vi.mocked(prisma.invoice.findFirst).mock.calls[0][0]?.select;
    expect(selectArg).not.toHaveProperty("filePath");
    expect(selectArg).not.toHaveProperty("fileHash");
    expect(selectArg).not.toHaveProperty("storedFilename");
    expect(selectArg).not.toHaveProperty("parserRawOutput");
    expect(selectArg).not.toHaveProperty("deletedAt");
  });
});
