import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "@/components/status-badge";

describe("StatusBadge", () => {
  it("renders processing status label and color", () => {
    render(<StatusBadge status="PARSED" type="processing" />);
    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveTextContent("Parsed");
    expect(badge.className).toContain("bg-green-100");
  });

  it("renders review status label and color", () => {
    render(<StatusBadge status="REJECTED" type="review" />);
    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveTextContent("Rejected");
    expect(badge.className).toContain("bg-red-100");
  });

  it("renders FAILED_PARSE with red color and Failed label", () => {
    render(<StatusBadge status="FAILED_PARSE" type="processing" />);
    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveTextContent("Failed");
    expect(badge.className).toContain("bg-red-100");
  });

  it("handles unknown status with fallback gray badge", () => {
    render(<StatusBadge status="UNKNOWN_VALUE" type="processing" />);
    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveTextContent("UNKNOWN_VALUE");
    expect(badge.className).toContain("bg-gray-100");
    expect(badge.className).toContain("truncate");
  });
});
