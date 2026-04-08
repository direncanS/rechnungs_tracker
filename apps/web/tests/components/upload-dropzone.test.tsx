import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import UploadDropzone from "@/components/upload-dropzone";

function makePdfFile(name = "invoice.pdf") {
  return new File(["%PDF-content"], name, { type: "application/pdf" });
}

function mockStatusResponse(processingStatus: string, reviewStatus: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ processingStatus, reviewStatus }),
  };
}

describe("UploadDropzone", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders dropzone in idle state", () => {
    render(<UploadDropzone />);
    expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
    expect(
      screen.getByText(/drag and drop a pdf file here/i)
    ).toBeInTheDocument();
  });

  it("shows error on invalid file type", () => {
    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input");
    const txtFile = new File(["content"], "test.txt", {
      type: "text/plain",
    });
    fireEvent.change(input, { target: { files: [txtFile] } });
    expect(screen.getByTestId("upload-error")).toHaveTextContent(
      "Only PDF files are accepted"
    );
  });

  it("calls upload API on file select and upload click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "inv-1",
          processingStatus: "QUEUED",
          reviewStatus: "PENDING",
        }),
    });
    // Immediate poll + any interval polls — return terminal to stop polling
    mockFetch.mockResolvedValue(
      mockStatusResponse("PARSED", "NEEDS_REVIEW")
    );

    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input");
    fireEvent.change(input, { target: { files: [makePdfFile()] } });
    fireEvent.click(screen.getByTestId("upload-button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/invoices/upload", {
        method: "POST",
        body: expect.any(FormData),
      });
    });
  });

  it("shows success state after upload and begins polling", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "inv-1",
          processingStatus: "QUEUED",
          reviewStatus: "PENDING",
        }),
    });
    // Status polls — return terminal to stop polling
    mockFetch.mockResolvedValue(
      mockStatusResponse("PARSED", "NEEDS_REVIEW")
    );

    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input");
    fireEvent.change(input, { target: { files: [makePdfFile()] } });
    fireEvent.click(screen.getByTestId("upload-button"));

    await waitFor(() => {
      expect(screen.getByTestId("upload-status")).toBeInTheDocument();
    });

    // Verify status fetch was called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/invoices/inv-1/status");
    });
  });

  it("shows View invoice link when status is PARSED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "inv-1",
          processingStatus: "QUEUED",
          reviewStatus: "PENDING",
        }),
    });
    // Status poll returns PARSED (terminal)
    mockFetch.mockResolvedValue(
      mockStatusResponse("PARSED", "NEEDS_REVIEW")
    );

    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input");
    fireEvent.change(input, { target: { files: [makePdfFile()] } });
    fireEvent.click(screen.getByTestId("upload-button"));

    await waitFor(() => {
      const link = screen.getByText("View invoice");
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toHaveAttribute("href", "/invoices/inv-1");
    });
  });

  it("shows error message on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: "Duplicate file: this PDF has already been uploaded",
        }),
    });

    render(<UploadDropzone />);
    const input = screen.getByTestId("upload-input");
    fireEvent.change(input, { target: { files: [makePdfFile()] } });
    fireEvent.click(screen.getByTestId("upload-button"));

    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toHaveTextContent(
        "Duplicate file: this PDF has already been uploaded"
      );
    });
  });
});
