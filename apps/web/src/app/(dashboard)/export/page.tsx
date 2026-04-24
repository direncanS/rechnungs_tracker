"use client";

import { useState } from "react";
import InvoiceFilters, {
  type InvoiceFilterValues,
} from "@/components/invoice-filters";

export default function ExportPage() {
  const [filters, setFilters] = useState<InvoiceFilterValues>({
    processingStatus: "",
    reviewStatus: "",
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        data-testid="export-download"
      >
        {downloading ? "Downloading..." : "Download CSV"}
      </button>
    </div>
  );
}
