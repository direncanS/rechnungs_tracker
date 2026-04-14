import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/export/invoices/csv/route";

function makeSession() {
  return {
    user: { id: "owner1", email: "owner@test.com", name: "Owner", role: "OWNER" },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

const mockInvoice = {
  invoiceNumber: "INV-001",
  invoiceDate: new Date("2026-03-15"),
  dueDate: new Date("2026-04-15"),
  supplier: { name: "Acme Corp" },
  totalAmount: "1234.56",
  subtotal: "1037.44",
  taxAmount: "197.12",
  currency: "EUR",
  processingStatus: "PARSED",
  reviewStatus: "NEEDS_REVIEW",
  uploadedBy: { name: "Admin" },
  createdAt: new Date("2026-03-14T10:00:00.000Z"),
};

function callGET(queryString = "") {
  const url = `http://localhost/api/export/invoices/csv${queryString}`;
  return GET(new Request(url));
}

describe("GET /api/export/invoices/csv", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([mockInvoice] as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await callGET();
    expect(response.status).toBe(401);
  });

  it("returns CSV with correct headers, Content-Type and Content-Disposition", async () => {
    const response = await callGET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="invoices-export-\d{4}-\d{2}-\d{2}\.csv"/
    );

    const csv = await response.text();
    const lines = csv.split("\r\n");
    // Header row
    expect(lines[0]).toContain("Invoice Number");
    expect(lines[0]).toContain("Created At");
    // Data row
    expect(lines[1]).toContain("INV-001");
    expect(lines[1]).toContain("2026-03-15");
    expect(lines[1]).toContain("Acme Corp");
    expect(lines[1]).toContain("1234.56");
  });

  it("sanitizes injection-prefixed values", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        ...mockInvoice,
        invoiceNumber: "=CMD()",
      },
    ] as never);
    const response = await callGET();
    const csv = await response.text();
    // Should be prefixed with apostrophe: "'=CMD()"
    expect(csv).toContain("\"'=CMD()\"");
    expect(csv).not.toContain("\"=CMD()\"");
  });

  it("filters by processingStatus and reviewStatus", async () => {
    await callGET("?processingStatus=PARSED&reviewStatus=VERIFIED");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          processingStatus: "PARSED",
          reviewStatus: "VERIFIED",
        }),
      })
    );
  });

  it("returns headers only for empty result", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
    const response = await callGET();
    const csv = await response.text();
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1); // header row only
    expect(lines[0]).toContain("Invoice Number");
  });

  it("escapes commas and quotes in values", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        ...mockInvoice,
        supplier: { name: 'ACME, "Ltd"' },
      },
    ] as never);
    const response = await callGET();
    const csv = await response.text();
    // Commas and quotes inside double-quoted, quotes doubled
    expect(csv).toContain('"ACME, ""Ltd"""');
  });

  it("returns 400 for invalid enum filter", async () => {
    const response = await callGET("?processingStatus=BOGUS");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("processingStatus");
  });
});
