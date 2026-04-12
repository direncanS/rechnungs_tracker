"use client";

import { useState } from "react";

interface CurrentInvoiceValues {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
  notes: string | null;
}

interface ReviewActionsProps {
  invoiceId: string;
  currentValues: CurrentInvoiceValues;
  onReviewComplete: () => void;
}

type Mode = "idle" | "rejecting" | "editing";

const NUMERIC_FIELDS = ["subtotal", "taxAmount", "totalAmount"];
const DATE_FIELDS = ["invoiceDate", "dueDate"];

const EDIT_FIELD_LABELS: Record<string, string> = {
  invoiceNumber: "Invoice Number",
  invoiceDate: "Invoice Date",
  dueDate: "Due Date",
  subtotal: "Subtotal",
  taxAmount: "Tax Amount",
  totalAmount: "Total Amount",
  currency: "Currency",
  notes: "Notes",
};

const EDIT_FIELDS = Object.keys(EDIT_FIELD_LABELS);

function normalizeValue(
  key: string,
  formValue: string,
  originalValue: string | number | null
): { changed: boolean; value: string | number | null } {
  if (NUMERIC_FIELDS.includes(key)) {
    const trimmed = formValue.trim();
    if (trimmed === "") {
      return { changed: originalValue !== null, value: null };
    }
    const num = Number(trimmed);
    if (isNaN(num)) {
      return { changed: true, value: num };
    }
    return { changed: num !== originalValue, value: num };
  }

  if (DATE_FIELDS.includes(key)) {
    const trimmed = formValue.trim();
    if (trimmed === "") {
      return { changed: originalValue !== null, value: null };
    }
    return { changed: trimmed !== originalValue, value: trimmed };
  }

  // Text fields
  const trimmed = formValue.trim();
  if (trimmed === "") {
    return { changed: originalValue !== null, value: null };
  }
  return { changed: trimmed !== originalValue, value: trimmed };
}

export default function ReviewActions({
  invoiceId,
  currentValues,
  onReviewComplete,
}: ReviewActionsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [comment, setComment] = useState("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  function initEditFields() {
    const fields: Record<string, string> = {};
    for (const key of EDIT_FIELDS) {
      const val = currentValues[key as keyof CurrentInvoiceValues];
      fields[key] = val != null ? String(val) : "";
    }
    return fields;
  }

  async function submitReview(body: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    setIsConflict(false);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        setIsConflict(true);
        setError("Review conflict: invoice state changed. Please reload.");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Failed to submit review"
        );
        return;
      }

      setMode("idle");
      onReviewComplete();
    } catch {
      setError("Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  function handleApprove() {
    submitReview({ action: "APPROVED" });
  }

  function handleRejectSubmit() {
    if (!comment.trim()) return;
    submitReview({ action: "REJECTED", comment: comment.trim() });
  }

  function handleEditSubmit() {
    const changes: Record<string, string | number | null> = {};
    for (const key of EDIT_FIELDS) {
      const original = currentValues[key as keyof CurrentInvoiceValues];
      const result = normalizeValue(key, editFields[key] ?? "", original);
      if (result.changed) {
        changes[key] = result.value;
      }
    }

    if (Object.keys(changes).length === 0) {
      setError("No changes detected");
      return;
    }

    submitReview({ action: "EDITED", changes });
  }

  return (
    <div data-testid="review-actions" className="space-y-3">
      {error && (
        <div className="text-sm text-red-600" data-testid="review-error">
          {error}
          {isConflict && (
            <button
              onClick={() => window.location.reload()}
              className="ml-2 text-blue-600 hover:underline"
              data-testid="conflict-reload"
            >
              Reload
            </button>
          )}
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            data-testid="approve-button"
          >
            {submitting ? "Submitting..." : "Approve"}
          </button>
          <button
            onClick={() => {
              setMode("rejecting");
              setComment("");
              setError(null);
            }}
            disabled={submitting}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            data-testid="reject-button"
          >
            Reject
          </button>
          <button
            onClick={() => {
              setMode("editing");
              setEditFields(initEditFields());
              setError(null);
            }}
            disabled={submitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            data-testid="edit-button"
          >
            Edit
          </button>
        </div>
      )}

      {mode === "rejecting" && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            rows={3}
            data-testid="reject-comment"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRejectSubmit}
              disabled={submitting || !comment.trim()}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              data-testid="reject-submit"
            >
              {submitting ? "Submitting..." : "Confirm Reject"}
            </button>
            <button
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              disabled={submitting}
              className="rounded border border-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "editing" && (
        <div className="space-y-3" data-testid="edit-form">
          {EDIT_FIELDS.map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {EDIT_FIELD_LABELS[key]}
              </label>
              <input
                type={
                  DATE_FIELDS.includes(key)
                    ? "date"
                    : NUMERIC_FIELDS.includes(key)
                    ? "number"
                    : "text"
                }
                step={NUMERIC_FIELDS.includes(key) ? "0.01" : undefined}
                value={editFields[key] ?? ""}
                onChange={(e) =>
                  setEditFields((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                data-testid={`edit-field-${key}`}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={handleEditSubmit}
              disabled={submitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              data-testid="edit-submit"
            >
              {submitting ? "Submitting..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              disabled={submitting}
              className="rounded border border-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
