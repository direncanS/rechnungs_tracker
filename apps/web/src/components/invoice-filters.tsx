"use client";

import {
  PROCESSING_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/constants";

export interface InvoiceFilterValues {
  processingStatus: string;
  reviewStatus: string;
}

interface InvoiceFiltersProps {
  filters: InvoiceFilterValues;
  onChange: (filters: InvoiceFilterValues) => void;
}

export default function InvoiceFilters({
  filters,
  onChange,
}: InvoiceFiltersProps) {
  return (
    <div className="flex gap-4">
      <select
        value={filters.processingStatus}
        onChange={(e) =>
          onChange({ ...filters, processingStatus: e.target.value })
        }
        className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        data-testid="filter-processing-status"
      >
        <option value="">All Processing</option>
        {Object.entries(PROCESSING_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={filters.reviewStatus}
        onChange={(e) =>
          onChange({ ...filters, reviewStatus: e.target.value })
        }
        className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        data-testid="filter-review-status"
      >
        <option value="">All Review</option>
        {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
