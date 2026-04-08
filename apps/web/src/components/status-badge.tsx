import {
  PROCESSING_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/constants";

const PROCESSING_COLORS: Record<string, string> = {
  UPLOADED: "bg-gray-100 text-gray-700",
  QUEUED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  PARSED: "bg-green-100 text-green-700",
  FAILED_PARSE: "bg-red-100 text-red-700",
};

const REVIEW_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  NEEDS_REVIEW: "bg-yellow-100 text-yellow-700",
  VERIFIED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

const FALLBACK_COLORS = "bg-gray-100 text-gray-700";

interface StatusBadgeProps {
  status: string;
  type: "processing" | "review";
}

export default function StatusBadge({ status, type }: StatusBadgeProps) {
  const labels =
    type === "processing" ? PROCESSING_STATUS_LABELS : REVIEW_STATUS_LABELS;
  const colors =
    type === "processing" ? PROCESSING_COLORS : REVIEW_COLORS;

  const label = labels[status] ?? status;
  const colorClass = colors[status] ?? FALLBACK_COLORS;

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium truncate ${colorClass}`}
      data-testid="status-badge"
    >
      {label}
    </span>
  );
}
