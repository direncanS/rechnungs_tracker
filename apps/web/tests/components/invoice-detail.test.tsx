import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "inv-1" }),
}));

// Mock next-auth/react
const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import InvoiceDetailPage from "@/app/(dashboard)/invoices/[id]/page";

const fullInvoice = {
  id: "inv-1",
  invoiceNumber: "INV-001",
  invoiceDate: "2024-01-15",
  dueDate: "2024-02-15",
  subtotal: 1000.0,
  taxAmount: 190.0,
  totalAmount: 1190.0,
  currency: "EUR",
  originalFilename: "test.pdf",
  processingStatus: "PARSED",
  reviewStatus: "NEEDS_REVIEW",
  parserVersion: "1.0.0",
  parserConfidence: 0.85,
  notes: null,
  createdAt: "2024-01-15T10:00:00Z",
  updatedAt: "2024-01-15T10:00:00Z",
  supplier: { id: "sup-1", name: "Test Supplier", address: "123 Main St" },
  uploadedBy: { id: "user-1", name: "Worker User", email: "worker@test.com" },
  items: [
    {
      id: "item-1",
      lineNumber: 1,
      description: "Widget A",
      quantity: 10,
      unit: "pcs",
      unitPrice: 100.0,
      totalPrice: 1000.0,
      taxRate: 19.0,
      isEdited: false,
      editedFields: null,
    },
  ],
  reviews: [
    {
      id: "rev-1",
      action: "EDITED",
      comment: null,
      changes: { totalAmount: 1190.0 },
      createdAt: "2024-01-16T10:00:00Z",
      reviewedBy: { id: "user-2", name: "Accountant User" },
    },
  ],
};

describe("InvoiceDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state", () => {
    mockUseSession.mockReturnValue({ data: null });
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<InvoiceDetailPage />);
    expect(screen.getByTestId("detail-loading")).toBeInTheDocument();
  });

  it("renders full invoice detail for ACCOUNTANT with review actions", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-2", name: "Accountant", role: "ACCOUNTANT" } },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fullInvoice),
    });

    render(<InvoiceDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-detail")).toBeInTheDocument();
    });

    // Invoice number displayed
    expect(screen.getByText("INV-001")).toBeInTheDocument();
    // Status badges
    expect(screen.getByTestId("invoice-header")).toBeInTheDocument();
    // Items table
    expect(screen.getByTestId("invoice-items")).toBeInTheDocument();
    expect(screen.getByText("Widget A")).toBeInTheDocument();
    // Review history
    expect(screen.getByTestId("review-history")).toBeInTheDocument();
    // Review actions visible for ACCOUNTANT
    expect(screen.getByTestId("review-actions")).toBeInTheDocument();
  });

  it("hides review actions for WORKER", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Worker", role: "WORKER" } },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fullInvoice),
    });

    render(<InvoiceDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-detail")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("review-actions")).not.toBeInTheDocument();
  });

  it("hides review actions when status is not reviewable", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-2", name: "Accountant", role: "ACCOUNTANT" } },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...fullInvoice, reviewStatus: "VERIFIED" }),
    });

    render(<InvoiceDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-detail")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("review-actions")).not.toBeInTheDocument();
  });
});
