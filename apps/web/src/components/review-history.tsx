interface ReviewData {
  id: string;
  action: string;
  comment: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
  reviewedBy: { id: string; name: string };
}

interface ReviewHistoryProps {
  reviews: ReviewData[];
}

const ACTION_COLORS: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  EDITED: "bg-blue-100 text-blue-700",
};

const CHANGE_LABELS: Record<string, string> = {
  invoiceNumber: "Invoice Number",
  invoiceDate: "Invoice Date",
  dueDate: "Due Date",
  subtotal: "Subtotal",
  taxAmount: "Tax Amount",
  totalAmount: "Total Amount",
  currency: "Currency",
  notes: "Notes",
  supplierId: "Supplier",
  previousSupplierId: "Previous Supplier",
};

export default function ReviewHistory({ reviews }: ReviewHistoryProps) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4" data-testid="reviews-empty">
        No reviews yet
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="review-history">
      {reviews.map((review) => (
        <div
          key={review.id}
          className="border rounded p-3"
          data-testid="review-entry"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                ACTION_COLORS[review.action] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {review.action}
            </span>
            <span className="text-sm font-medium">
              {review.reviewedBy.name}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(review.createdAt).toLocaleString()}
            </span>
          </div>

          {review.comment && (
            <p className="text-sm text-gray-700 mt-1">{review.comment}</p>
          )}

          {review.action === "EDITED" && review.changes && (
            <ul className="mt-2 text-sm text-gray-600 space-y-0.5">
              {Object.entries(review.changes).map(([key, value]) => (
                <li key={key}>
                  <span className="font-medium">
                    {CHANGE_LABELS[key] ?? key}:
                  </span>{" "}
                  {value != null ? String(value) : "cleared"}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
