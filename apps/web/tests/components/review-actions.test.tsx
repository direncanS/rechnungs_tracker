import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import ReviewActions from "@/components/review-actions";

const defaultValues = {
  invoiceNumber: "INV-001",
  invoiceDate: "2024-01-15",
  dueDate: "2024-02-15",
  subtotal: 1000.0,
  taxAmount: 190.0,
  totalAmount: 1190.0,
  currency: "EUR",
  notes: null,
};

describe("ReviewActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("approve calls API and triggers callback", async () => {
    const onComplete = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "rev-1" }),
    });

    render(
      <ReviewActions
        invoiceId="inv-1"
        currentValues={defaultValues}
        onReviewComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByTestId("approve-button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "APPROVED" }),
        })
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("reject requires comment and calls API", async () => {
    const onComplete = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "rev-1" }),
    });

    render(
      <ReviewActions
        invoiceId="inv-1"
        currentValues={defaultValues}
        onReviewComplete={onComplete}
      />
    );

    // Click reject to open textarea
    fireEvent.click(screen.getByTestId("reject-button"));
    expect(screen.getByTestId("reject-comment")).toBeInTheDocument();

    // Submit button disabled without comment
    expect(screen.getByTestId("reject-submit")).toBeDisabled();

    // Type comment
    fireEvent.change(screen.getByTestId("reject-comment"), {
      target: { value: "Incorrect amounts" },
    });

    // Submit
    fireEvent.click(screen.getByTestId("reject-submit"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "REJECTED",
            comment: "Incorrect amounts",
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("edit submits changed fields only", async () => {
    const onComplete = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "rev-1" }),
    });

    render(
      <ReviewActions
        invoiceId="inv-1"
        currentValues={defaultValues}
        onReviewComplete={onComplete}
      />
    );

    // Click edit
    fireEvent.click(screen.getByTestId("edit-button"));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();

    // Modify only totalAmount
    fireEvent.change(screen.getByTestId("edit-field-totalAmount"), {
      target: { value: "1500.00" },
    });

    // Submit
    fireEvent.click(screen.getByTestId("edit-submit"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "EDITED",
            changes: { totalAmount: 1500 },
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("shows conflict error on 409", async () => {
    const onComplete = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({ error: "Review conflict" }),
    });

    render(
      <ReviewActions
        invoiceId="inv-1"
        currentValues={defaultValues}
        onReviewComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByTestId("approve-button"));

    await waitFor(() => {
      expect(screen.getByTestId("review-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("conflict-reload")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
