"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import PdfViewer from "@/components/pdf-viewer";
import InvoiceItems from "@/components/invoice-items";
import ReviewHistory from "@/components/review-history";
import ReviewActions from "@/components/review-actions";
import SupplierSelect from "@/components/supplier-select";

const ROLE_LEVEL: Record<string, number> = {
  WORKER: 0,
  ACCOUNTANT: 1,
  OWNER: 2,
};

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
  originalFilename: string;
  processingStatus: string;
  reviewStatus: string;
  parserVersion: string | null;
  parserConfidence: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; address: string | null } | null;
  uploadedBy: { id: string; name: string; email: string };
  items: {
    id: string;
    lineNumber: number;
    description: string | null;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    totalPrice: number | null;
    taxRate: number | null;
    isEdited: boolean;
    editedFields: unknown;
  }[];
  reviews: {
    id: string;
    action: string;
    comment: string | null;
    changes: Record<string, unknown> | null;
    createdAt: string;
    reviewedBy: { id: string; name: string };
  }[];
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${id}`);

      if (res.status === 403) {
        setError("You do not have access to this invoice");
        return;
      }
      if (res.status === 404) {
        setError("Invoice not found");
        return;
      }
      if (!res.ok) {
        setError("Failed to load invoice");
        return;
      }

      const data = await res.json();
      setInvoice(data);
    } catch {
      setError("Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  const role = (session?.user?.role as string) ?? "WORKER";
  const canReview =
    invoice !== null &&
    ROLE_LEVEL[role] >= ROLE_LEVEL["ACCOUNTANT"] &&
    invoice.processingStatus === "PARSED" &&
    invoice.reviewStatus === "NEEDS_REVIEW";

  if (loading) {
    return (
      <div className="flex justify-center py-12" data-testid="detail-loading">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div data-testid="detail-error" className="py-12 text-center">
        <p className="text-sm text-red-600 mb-4">{error ?? "Unknown error"}</p>
        <Link
          href="/invoices"
          className="text-sm text-blue-600 hover:underline"
          data-testid="back-link"
        >
          Back to Invoices
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="invoice-detail">
      <div className="mb-4">
        <Link
          href="/invoices"
          className="text-sm text-blue-600 hover:underline"
          data-testid="back-link"
        >
          &larr; Back to Invoices
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: PDF */}
        <PdfViewer invoiceId={id} />

        {/* Right: Details */}
        <div className="overflow-y-auto space-y-6">
          {/* Header */}
          <div data-testid="invoice-header">
            <h2 className="text-xl font-semibold mb-2">
              {invoice.invoiceNumber ?? invoice.originalFilename}
            </h2>
            <div className="flex gap-2">
              <StatusBadge
                status={invoice.processingStatus}
                type="processing"
              />
              <StatusBadge status={invoice.reviewStatus} type="review" />
            </div>
          </div>

          {/* Info Section */}
          <div
            className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"
            data-testid="invoice-info"
          >
            <div>
              <span className="font-medium text-gray-600">Invoice Date:</span>{" "}
              {invoice.invoiceDate
                ? new Date(invoice.invoiceDate).toLocaleDateString()
                : "-"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Due Date:</span>{" "}
              {invoice.dueDate
                ? new Date(invoice.dueDate).toLocaleDateString()
                : "-"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Subtotal:</span>{" "}
              {invoice.subtotal != null ? invoice.subtotal.toFixed(2) : "-"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Tax:</span>{" "}
              {invoice.taxAmount != null ? invoice.taxAmount.toFixed(2) : "-"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Total:</span>{" "}
              {invoice.totalAmount != null
                ? invoice.totalAmount.toFixed(2)
                : "-"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Currency:</span>{" "}
              {invoice.currency ?? "-"}
            </div>
            {invoice.notes && (
              <div className="col-span-2">
                <span className="font-medium text-gray-600">Notes:</span>{" "}
                {invoice.notes}
              </div>
            )}
            <div className="col-span-2">
              <span className="font-medium text-gray-600">Uploaded by:</span>{" "}
              {invoice.uploadedBy.name}
            </div>
          </div>

          {/* Supplier */}
          {canReview ? (
            <SupplierSelect
              invoiceId={id}
              currentSupplier={invoice.supplier}
              onSupplierChanged={fetchInvoice}
            />
          ) : (
            <div className="text-sm">
              <span className="font-medium">Supplier: </span>
              {invoice.supplier ? (
                <span>
                  {invoice.supplier.name}
                  {invoice.supplier.address && (
                    <span className="text-gray-500 ml-1">
                      ({invoice.supplier.address})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-500">No supplier</span>
              )}
            </div>
          )}

          {/* Line Items */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Line Items</h3>
            <InvoiceItems items={invoice.items} />
          </div>

          {/* Review Actions */}
          {canReview && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Review</h3>
              <ReviewActions
                invoiceId={id}
                currentValues={{
                  invoiceNumber: invoice.invoiceNumber,
                  invoiceDate: invoice.invoiceDate,
                  dueDate: invoice.dueDate,
                  subtotal: invoice.subtotal,
                  taxAmount: invoice.taxAmount,
                  totalAmount: invoice.totalAmount,
                  currency: invoice.currency,
                  notes: invoice.notes,
                }}
                onReviewComplete={fetchInvoice}
              />
            </div>
          )}

          {/* Review History */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Review History</h3>
            <ReviewHistory reviews={invoice.reviews} />
          </div>
        </div>
      </div>
    </div>
  );
}
