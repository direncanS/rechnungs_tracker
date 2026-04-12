import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import SupplierSelect from "@/components/supplier-select";

describe("SupplierSelect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("PATCH calls API and triggers callback", async () => {
    const onChanged = vi.fn();

    // First call: supplier search (triggered on "Change Supplier" click)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            { id: "sup-2", name: "New Supplier", address: "456 Oak Ave" },
          ],
        }),
    });

    render(
      <SupplierSelect
        invoiceId="inv-1"
        currentSupplier={{ id: "sup-1", name: "Old Supplier", address: null }}
        onSupplierChanged={onChanged}
      />
    );

    // Open search
    fireEvent.click(screen.getByTestId("change-supplier-button"));

    // Wait for supplier list
    await waitFor(() => {
      expect(screen.getByTestId("supplier-option")).toBeInTheDocument();
    });

    // Mock the PATCH call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ invoice: { id: "inv-1", supplierId: "sup-2" } }),
    });

    // Select supplier
    fireEvent.click(screen.getByTestId("supplier-option"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/supplier",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ supplierId: "sup-2" }),
        })
      );
    });

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("shows conflict error on 409", async () => {
    const onChanged = vi.fn();

    // Supplier search
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            { id: "sup-2", name: "New Supplier", address: null },
          ],
        }),
    });

    render(
      <SupplierSelect
        invoiceId="inv-1"
        currentSupplier={null}
        onSupplierChanged={onChanged}
      />
    );

    fireEvent.click(screen.getByTestId("change-supplier-button"));

    await waitFor(() => {
      expect(screen.getByTestId("supplier-option")).toBeInTheDocument();
    });

    // Mock 409 PATCH
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "Conflict" }),
    });

    fireEvent.click(screen.getByTestId("supplier-option"));

    await waitFor(() => {
      expect(screen.getByTestId("supplier-error")).toBeInTheDocument();
    });
    expect(onChanged).not.toHaveBeenCalled();
  });
});
