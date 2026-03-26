import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    invoiceReview: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/suppliers/route";
import { PATCH } from "@/app/api/invoices/[id]/supplier/route";

function makeSession(overrides?: Partial<Session["user"]>): Session {
  return {
    user: {
      id: "u1",
      email: "accountant@test.com",
      name: "Accountant",
      role: "ACCOUNTANT",
      ...overrides,
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

const mockSuppliers = [
  { id: "s1", name: "ACME Corp", address: "123 Main St", createdAt: new Date() },
  { id: "s2", name: "Beta Inc", address: null, createdAt: new Date() },
];

describe("GET /api/suppliers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.supplier.findMany).mockResolvedValue(mockSuppliers as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await GET(new Request("http://localhost/api/suppliers"));
    expect(response.status).toBe(401);
  });

  it("returns 403 for WORKER role", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );
    const response = await GET(new Request("http://localhost/api/suppliers"));
    expect(response.status).toBe(403);
  });

  it("returns supplier list for ACCOUNTANT", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await GET(new Request("http://localhost/api/suppliers"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].name).toBe("ACME Corp");
  });

  it("never exposes taxId in response", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    await GET(new Request("http://localhost/api/suppliers"));
    const selectArg = vi.mocked(prisma.supplier.findMany).mock.calls[0][0]?.select;
    expect(selectArg).not.toHaveProperty("taxId");
  });

  it("filters by search param", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    await GET(new Request("http://localhost/api/suppliers?search=ACME"));
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: "ACME", mode: "insensitive" },
        }),
      })
    );
  });
});

describe("PATCH /api/invoices/:id/supplier", () => {
  const reviewableInvoice = {
    id: "inv1",
    processingStatus: "PARSED",
    reviewStatus: "NEEDS_REVIEW",
    supplierId: "s1",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(reviewableInvoice as never);
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue({
      id: "s2",
      name: "Beta Inc",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      return (fn as (tx: typeof prisma) => Promise<unknown>)(prisma);
    });
    vi.mocked(prisma.invoice.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.invoiceReview.create).mockResolvedValue({
      id: "rev1",
      action: "EDITED",
      changes: { supplierId: "s2", previousSupplierId: "s1" },
      createdAt: new Date(),
    } as never);
  });

  function callPATCH(id: string, body: Record<string, unknown>) {
    const request = new Request(`http://localhost/api/invoices/${id}/supplier`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return PATCH(request, { params: Promise.resolve({ id }) });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await callPATCH("inv1", { supplierId: "s2" });
    expect(response.status).toBe(401);
  });

  it("returns 200 on happy path with audit trail", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPATCH("inv1", { supplierId: "s2" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoice.supplierId).toBe("s2");
    expect(body.action).toBe("EDITED");
  });

  it("returns 404 when invoice not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callPATCH("inv1", { supplierId: "s2" });
    expect(response.status).toBe(404);
  });

  it("returns 404 when supplier not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue(null);
    const response = await callPATCH("inv1", { supplierId: "nonexistent" });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/supplier/i);
  });

  it("returns 409 when invoice not in reviewable state", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "PARSED",
      reviewStatus: "VERIFIED",
      supplierId: "s1",
    } as never);
    const response = await callPATCH("inv1", { supplierId: "s2" });
    expect(response.status).toBe(409);
  });

  it("returns 400 when supplierId is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPATCH("inv1", {});
    expect(response.status).toBe(400);
  });
});
