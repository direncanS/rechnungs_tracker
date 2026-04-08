import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import InvoicesPage from "@/app/(dashboard)/invoices/page";

const mockListResponse = {
  items: [
    {
      id: "inv-1",
      invoiceNumber: "INV-001",
      invoiceDate: "2024-01-15",
      originalFilename: "test.pdf",
      processingStatus: "PARSED",
      reviewStatus: "NEEDS_REVIEW",
      totalAmount: 1234.56,
      currency: "EUR",
      createdAt: "2024-01-15T10:00:00Z",
      supplier: { id: "sup-1", name: "Test Supplier" },
    },
    {
      id: "inv-2",
      invoiceNumber: null,
      invoiceDate: null,
      originalFilename: "receipt.pdf",
      processingStatus: "QUEUED",
      reviewStatus: "PENDING",
      totalAmount: null,
      currency: null,
      createdAt: "2024-01-16T10:00:00Z",
      supplier: null,
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    totalCount: 2,
    totalPages: 1,
  },
};

describe("InvoicesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<InvoicesPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders invoice table with data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockListResponse),
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-table")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("invoice-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("INV-001")).toBeInTheDocument();
    expect(screen.getByText("Test Supplier")).toBeInTheDocument();
    expect(screen.getByText("1234.56 EUR")).toBeInTheDocument();
  });

  it("renders empty state when no invoices", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [],
          pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 },
        }),
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
    expect(screen.getByText("No invoices found")).toBeInTheDocument();
  });

  it("filter change triggers re-fetch with correct params and resets page to 1", async () => {
    // Initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockListResponse),
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-table")).toBeInTheDocument();
    });

    // Second fetch after filter change
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [],
          pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 },
        }),
    });

    const processingFilter = screen.getByTestId("filter-processing-status");
    fireEvent.change(processingFilter, { target: { value: "PARSED" } });

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const url = lastCall[0] as string;
      expect(url).toContain("processingStatus=PARSED");
      expect(url).toContain("page=1");
    });
  });

  it("pagination controls work — fetch URL includes correct page param", async () => {
    // Initial load with multiple pages
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockListResponse,
          pagination: { page: 1, pageSize: 20, totalCount: 40, totalPages: 2 },
        }),
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("pagination")).toBeInTheDocument();
    });

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    // Click Next
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockListResponse,
          pagination: { page: 2, pageSize: 20, totalCount: 40, totalPages: 2 },
        }),
    });

    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const url = lastCall[0] as string;
      expect(url).toContain("page=2");
    });
  });
});
