"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import InvoiceFilters, {
  type InvoiceFilterValues,
} from "@/components/invoice-filters";
import StatusBadge from "@/components/status-badge";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

interface InvoiceItem {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  originalFilename: string;
  processingStatus: string;
  reviewStatus: string;
  totalAmount: number | null;
  currency: string | null;
  createdAt: string;
  supplier: { id: string; name: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<InvoiceFilterValues>({
    processingStatus: "",
    reviewStatus: "",
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchInvoices = useCallback(
    async (currentPage: number, currentFilters: InvoiceFilterValues) => {
      // Abort previous request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("pageSize", String(DEFAULT_PAGE_SIZE));
      if (currentFilters.processingStatus) {
        params.set("processingStatus", currentFilters.processingStatus);
      }
      if (currentFilters.reviewStatus) {
        params.set("reviewStatus", currentFilters.reviewStatus);
      }

      try {
        const res = await fetch(`/api/invoices?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("Failed");
        }
        const data = await res.json();
        setItems(data.items);
        setPagination(data.pagination);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return; // Silently ignore aborted requests
        }
        setError("Failed to load invoices");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    fetchInvoices(page, filters);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [page, filters, fetchInvoices]);

  function handleFilterChange(newFilters: InvoiceFilterValues) {
    setFilters(newFilters);
    setPage(1);
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Invoices</h2>

      <div className="mb-4">
        <InvoiceFilters filters={filters} onChange={handleFilterChange} />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading && !error && (
        <div className="flex justify-center py-12">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div data-testid="empty-state" className="py-12 text-center">
          <p className="text-sm text-gray-500">No invoices found</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              data-testid="invoice-table"
            >
              <thead>
                <tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Processing</th>
                  <th className="px-3 py-2">Review</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-gray-50"
                    data-testid="invoice-row"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/invoices/${item.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {item.invoiceNumber ?? item.originalFilename}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {item.supplier?.name ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {item.totalAmount != null
                        ? `${item.totalAmount.toFixed(2)} ${item.currency ?? ""}`
                        : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={item.processingStatus}
                        type="processing"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={item.reviewStatus}
                        type="review"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {item.invoiceDate
                        ? new Date(item.invoiceDate).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="mt-4 flex items-center justify-between"
            data-testid="pagination"
          >
            <span className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
