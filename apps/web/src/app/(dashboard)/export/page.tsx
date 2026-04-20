"use client";

import { useEffect, useState } from "react";
import InvoiceFilters, {
  type InvoiceFilterValues,
} from "@/components/invoice-filters";
import StatusBadge from "@/components/status-badge";

interface PreviewItem {
  id: string;
  invoiceNumber: string | null;
  originalFilename: string;
  supplier: { name: string } | null;
  totalAmount: string | number | null;
  currency: string | null;
  processingStatus: string;
  reviewStatus: string;
}

const PREVIEW_PAGE_SIZE = 20;

export default function ExportPage() {
  const [filters, setFilters] = useState<InvoiceFilterValues>({
    processingStatus: "",
    reviewStatus: "",
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPreviewLoading(true);

    const params = new URLSearchParams({
      page: "1",
      pageSize: String(PREVIEW_PAGE_SIZE),
    });
    if (filters.processingStatus)
      params.set("processingStatus", filters.processingStatus);
    if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);

    fetch(`/api/invoices?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setPreview(data.items ?? []);
        setTotalCount(data.pagination?.totalCount ?? 0);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setPreview([]);
        setTotalCount(null);
      })
      .finally(() => setPreviewLoading(false));

    return () => controller.abort();
  }, [filters.processingStatus, filters.reviewStatus]);

  async function handleDownload() {
    setDownloading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.processingStatus)
        params.set("processingStatus", filters.processingStatus);
      if (filters.reviewStatus)
        params.set("reviewStatus", filters.reviewStatus);

      const res = await fetch(
        `/api/export/invoices/csv?${params.toString()}`
      );

      if (!res.ok) {
        try {
          const body = await res.json();
          setError(body.error ?? "Export failed");
        } catch {
          setError("Export failed");
        }
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const disposition = res.headers.get("Content-Disposition");
      let filename = "invoices-export.csv";
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Export Invoices</h2>

      <div className="mb-4">
        <InvoiceFilters filters={filters} onChange={setFilters} />
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4" data-testid="export-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handleDownload}
          disabled={downloading || totalCount === 0}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="export-download"
        >
          {downloading ? "Downloading..." : "Download CSV"}
        </button>
        <span className="text-sm text-gray-600" data-testid="export-count">
          {previewLoading
            ? "Loading..."
            : totalCount === null
            ? ""
            : `${totalCount} invoice${totalCount === 1 ? "" : "s"} match${
                totalCount === 1 ? "es" : ""
              } the filter`}
        </span>
      </div>

      {preview.length > 0 && (
        <div
          className="overflow-x-auto rounded border border-gray-200"
          data-testid="export-preview"
        >
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Invoice #</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {preview.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    {item.invoiceNumber ?? item.originalFilename}
                  </td>
                  <td className="px-3 py-2">{item.supplier?.name ?? "-"}</td>
                  <td className="px-3 py-2">
                    {item.totalAmount != null
                      ? `${Number(item.totalAmount).toFixed(2)} ${
                          item.currency ?? ""
                        }`
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <StatusBadge
                        status={item.processingStatus}
                        type="processing"
                      />
                      <StatusBadge
                        status={item.reviewStatus}
                        type="review"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalCount !== null && totalCount > preview.length && (
            <p className="px-3 py-2 text-xs text-gray-500 bg-gray-50">
              Showing first {preview.length} of {totalCount} — full list will
              be exported
            </p>
          )}
        </div>
      )}
    </div>
  );
}
