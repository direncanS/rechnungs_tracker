import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import SuppliersPage from "@/app/(dashboard)/suppliers/page";

const mockSuppliers = {
  items: [
    {
      id: "sup-1",
      name: "Acme GmbH",
      address: "123 Main St",
      createdAt: "2024-01-15T10:00:00Z",
    },
    {
      id: "sup-2",
      name: "Widget Corp",
      address: null,
      createdAt: "2024-02-01T10:00:00Z",
    },
  ],
};

describe("SuppliersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders supplier table", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuppliers),
    });

    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("supplier-table")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("supplier-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Acme GmbH")).toBeInTheDocument();
    expect(screen.getByText("Widget Corp")).toBeInTheDocument();
  });

  it("search triggers re-fetch with search param", async () => {
    // Initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuppliers),
    });

    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("supplier-table")).toBeInTheDocument();
    });

    // Second fetch after search
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [mockSuppliers.items[0]],
        }),
    });

    fireEvent.change(screen.getByTestId("supplier-search"), {
      target: { value: "Acme" },
    });

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const lastUrl = calls[calls.length - 1][0] as string;
      expect(lastUrl).toContain("search=Acme");
    });
  });
});
