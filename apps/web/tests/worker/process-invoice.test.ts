import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    supplier: {
      upsert: vi.fn(),
    },
    invoiceItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { processInvoice } from "@/worker/process-invoice";

function makeJob(overrides?: Partial<Job<{ invoiceId: string }>>): Job<{ invoiceId: string }> {
  return {
    data: { invoiceId: "inv1" },
    attemptsMade: 0,
    ...overrides,
  } as Job<{ invoiceId: string }>;
}

const mockInvoice = {
  id: "inv1",
  filePath: "/app/storage/uploads/test.pdf",
};

function mockFetchSuccess(data = {}) {
  const defaultData = {
    supplier_name: "Test GmbH",
    supplier_address: "Berlin, Germany",
    supplier_tax_id: "DE123456789",
    invoice_number: "INV-001",
    invoice_date: "2026-01-15",
    due_date: "2026-02-15",
    subtotal: 100.0,
    tax_amount: 19.0,
    total_amount: 119.0,
    currency: "EUR",
    items: [
      {
        description: "Widget",
        quantity: 2,
        unit: "pcs",
        unit_price: 50.0,
        total_price: 100.0,
        tax_rate: 19.0,
      },
    ],
    ...data,
  };
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        ...defaultData,
        parser_version: "1.0.0",
        confidence: 0.85,
      }),
  });
}

describe("processInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(mockInvoice as ReturnType<typeof prisma.invoice.findUnique> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as ReturnType<typeof prisma.invoice.update> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      if (typeof fn === "function") {
        return fn(prisma as Parameters<typeof fn>[0]);
      }
    });
    vi.mocked(prisma.supplier.upsert).mockResolvedValue({
      id: "sup1",
      name: "Test GmbH",
      normalizedName: "test gmbh",
      address: "Berlin, Germany",
      taxId: "DE123456789",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.invoiceItem.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.invoiceItem.createMany).mockResolvedValue({ count: 1 });
  });

  it("sets PARSED + NEEDS_REVIEW on successful parse", async () => {
    mockFetchSuccess();
    await processInvoice(makeJob());
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingStatus: "PARSED",
          reviewStatus: "NEEDS_REVIEW",
        }),
      })
    );
  });

  it("sets FAILED_PARSE on success=false at last attempt", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Could not extract text",
        }),
    });
    await processInvoice(makeJob({ attemptsMade: 2 }));
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingStatus: "FAILED_PARSE",
          parseError: "Could not extract text",
        }),
      })
    );
  });

  it("throws for retry on success=false when not last attempt", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Could not extract text",
        }),
    });
    await expect(processInvoice(makeJob({ attemptsMade: 0 }))).rejects.toThrow(
      "Could not extract text"
    );
  });

  it("creates supplier with correct normalizedName", async () => {
    mockFetchSuccess({ supplier_name: "  Test GmbH  " });
    await processInvoice(makeJob());
    expect(prisma.supplier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { normalizedName: "test gmbh" },
        create: expect.objectContaining({
          name: "  Test GmbH  ",
          normalizedName: "test gmbh",
        }),
      })
    );
  });

  it("reuses existing supplier via upsert with empty update", async () => {
    mockFetchSuccess();
    await processInvoice(makeJob());
    expect(prisma.supplier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
      })
    );
  });

  it("creates InvoiceItems from parser items", async () => {
    mockFetchSuccess();
    await processInvoice(makeJob());
    expect(prisma.invoiceItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          invoiceId: "inv1",
          lineNumber: 1,
          description: "Widget",
          quantity: 2,
          unitPrice: 50.0,
          totalPrice: 100.0,
        }),
      ],
    });
  });

  it("deletes existing InvoiceItems before createMany (idempotency)", async () => {
    mockFetchSuccess();
    await processInvoice(makeJob());
    expect(prisma.invoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: "inv1" },
    });
    // deleteMany should be called before createMany in the transaction
    const deleteManyOrder = vi.mocked(prisma.invoiceItem.deleteMany).mock.invocationCallOrder[0];
    const createManyOrder = vi.mocked(prisma.invoiceItem.createMany).mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(createManyOrder);
  });

  it("throws for retry on HTTP error when not last attempt", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    await expect(processInvoice(makeJob({ attemptsMade: 0 }))).rejects.toThrow(
      "Parser returned HTTP 500"
    );
  });

  it("sets FAILED_PARSE on network error at last attempt", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await processInvoice(makeJob({ attemptsMade: 2 }));
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingStatus: "FAILED_PARSE",
          parseError: "ECONNREFUSED",
        }),
      })
    );
  });

  it("throws UnrecoverableError when invoice not found in DB", async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
    try {
      await processInvoice(makeJob());
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnrecoverableError);
    }
  });

  it("stores parserConfidence from parser response", async () => {
    mockFetchSuccess();
    await processInvoice(makeJob());
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parserConfidence: 0.85,
        }),
      })
    );
  });

  it("handles empty items list (still PARSED + NEEDS_REVIEW)", async () => {
    mockFetchSuccess({ items: [] });
    await processInvoice(makeJob());
    expect(prisma.invoiceItem.createMany).not.toHaveBeenCalled();
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingStatus: "PARSED",
          reviewStatus: "NEEDS_REVIEW",
        }),
      })
    );
  });
});
