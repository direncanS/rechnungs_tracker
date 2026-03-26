import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
import { POST } from "@/app/api/invoices/[id]/review/route";

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

const reviewableInvoice = {
  id: "inv1",
  processingStatus: "PARSED",
  reviewStatus: "NEEDS_REVIEW",
};

function callPOST(id: string, body: Record<string, unknown>) {
  const request = new Request(`http://localhost/api/invoices/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe("POST /api/invoices/:id/review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(reviewableInvoice as never);
    // Default: $transaction executes the callback
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      return (fn as (tx: typeof prisma) => Promise<unknown>)(prisma);
    });
    vi.mocked(prisma.invoice.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.invoiceReview.create).mockResolvedValue({
      id: "rev1",
      action: "APPROVED",
      comment: null,
      changes: null,
      createdAt: new Date("2026-01-01"),
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(401);
  });

  it("returns 403 for WORKER role", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(403);
  });

  it("uses verifyFromDb for privilege check", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    await callPOST("inv1", { action: "APPROVED" });
    expect(requireRole).toHaveBeenCalledWith("ACCOUNTANT", { verifyFromDb: true });
  });

  it("APPROVED → 200, reviewStatus becomes VERIFIED", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoice.reviewStatus).toBe("VERIFIED");
    expect(body.action).toBe("APPROVED");
  });

  it("REJECTED → 200, reviewStatus becomes REJECTED", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoiceReview.create).mockResolvedValue({
      id: "rev1",
      action: "REJECTED",
      comment: "duplicate",
      changes: null,
      createdAt: new Date("2026-01-01"),
    } as never);
    const response = await callPOST("inv1", {
      action: "REJECTED",
      comment: "duplicate",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoice.reviewStatus).toBe("REJECTED");
  });

  it("EDITED → 200, reviewStatus stays NEEDS_REVIEW, changes applied", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoiceReview.create).mockResolvedValue({
      id: "rev1",
      action: "EDITED",
      comment: null,
      changes: { notes: "corrected" },
      createdAt: new Date("2026-01-01"),
    } as never);
    const response = await callPOST("inv1", {
      action: "EDITED",
      changes: { notes: "corrected" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoice.reviewStatus).toBe("NEEDS_REVIEW");
    // Verify updateMany was called with changes
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: "corrected" }),
      })
    );
  });

  it("returns 400 for REJECTED without comment", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPOST("inv1", { action: "REJECTED" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/comment/i);
  });

  it("returns 400 for EDITED without changes", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPOST("inv1", { action: "EDITED" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/changes/i);
  });

  it("returns 400 for EDITED with invalid change key", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPOST("inv1", {
      action: "EDITED",
      changes: { filePath: "/hack" },
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("filePath");
  });

  it("returns 400 for invalid action", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    const response = await callPOST("inv1", { action: "BOGUS" });
    expect(response.status).toBe(400);
  });

  it("returns 404 when invoice not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(404);
  });

  it("returns 409 when invoice not in reviewable state (already VERIFIED)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "PARSED",
      reviewStatus: "VERIFIED",
    } as never);
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(409);
  });

  it("returns 409 when invoice not in reviewable state (PROCESSING)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
      id: "inv1",
      processingStatus: "PROCESSING",
      reviewStatus: "PENDING",
    } as never);
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(409);
  });

  it("returns 409 on concurrent review conflict (updateMany returns 0)", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.invoice.updateMany).mockResolvedValue({ count: 0 } as never);
    const response = await callPOST("inv1", { action: "APPROVED" });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/conflict/i);
  });
});
