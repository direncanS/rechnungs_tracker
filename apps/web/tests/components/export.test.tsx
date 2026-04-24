import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockCreateObjectURL = vi.fn().mockReturnValue("blob:test-url");
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

import ExportPage from "@/app/(dashboard)/export/page";

describe("ExportPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateObjectURL.mockReturnValue("blob:test-url");
  });

  it("renders filters and download button", () => {
    render(<ExportPage />);
    expect(screen.getByTestId("export-download")).toBeInTheDocument();
    expect(screen.getByTestId("filter-processing-status")).toBeInTheDocument();
    expect(screen.getByTestId("filter-review-status")).toBeInTheDocument();
  });

  it("download triggers fetch with filter params in URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="export.csv"' }),
      blob: () => Promise.resolve(new Blob(["csv-data"], { type: "text/csv" })),
    });

    render(<ExportPage />);

    fireEvent.change(screen.getByTestId("filter-processing-status"), {
      target: { value: "PARSED" },
    });

    fireEvent.click(screen.getByTestId("export-download"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("processingStatus=PARSED");
    });
  });

  it("shows error on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Invalid filter value" }),
    });

    render(<ExportPage />);
    fireEvent.click(screen.getByTestId("export-download"));

    await waitFor(() => {
      expect(screen.getByTestId("export-error")).toBeInTheDocument();
      expect(screen.getByText("Invalid filter value")).toBeInTheDocument();
    });
  });

  it("successful download calls createObjectURL with blob", async () => {
    const mockBlob = new Blob(["csv-data"], { type: "text/csv" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({}),
      blob: () => Promise.resolve(mockBlob),
    });

    render(<ExportPage />);
    fireEvent.click(screen.getByTestId("export-download"));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
    });
  });
});
