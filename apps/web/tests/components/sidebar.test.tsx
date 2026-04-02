import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-auth/react
const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signOut: vi.fn(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import Sidebar from "@/components/nav/sidebar";

function makeSessionData(role: string, name = "Test User") {
  return {
    data: {
      user: { id: "u1", name, email: "test@example.com", role },
      expires: "2099-01-01",
    },
    status: "authenticated",
  };
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Dashboard, Invoices, Upload for WORKER", () => {
    mockUseSession.mockReturnValue(makeSessionData("WORKER"));
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.queryByText("Suppliers")).not.toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
  });

  it("shows Suppliers for ACCOUNTANT (in addition to WORKER items)", () => {
    mockUseSession.mockReturnValue(makeSessionData("ACCOUNTANT"));
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Suppliers")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
  });

  it("shows all links for OWNER", () => {
    mockUseSession.mockReturnValue(makeSessionData("OWNER"));
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Suppliers")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("displays user name and role", () => {
    mockUseSession.mockReturnValue(makeSessionData("ACCOUNTANT", "Jane Doe"));
    render(<Sidebar />);
    expect(screen.getByTestId("user-name")).toHaveTextContent("Jane Doe");
    expect(screen.getByTestId("user-role")).toHaveTextContent("ACCOUNTANT");
  });

  it("renders sign out button", () => {
    mockUseSession.mockReturnValue(makeSessionData("WORKER"));
    render(<Sidebar />);
    expect(screen.getByTestId("logout-button")).toBeInTheDocument();
  });
});
