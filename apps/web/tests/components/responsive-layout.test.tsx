import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next-auth/react
const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import DashboardLayout from "@/app/(dashboard)/layout";

function makeSessionData(role = "OWNER") {
  return {
    data: {
      user: { id: "u1", name: "Test User", email: "test@test.com", role },
      expires: "2099-01-01",
    },
    status: "authenticated",
  };
}

describe("Responsive Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue(makeSessionData());
  });

  it("renders mobile menu button", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByTestId("mobile-menu-button")).toBeInTheDocument();
  });

  it("clicking mobile menu button shows sidebar backdrop", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mobile-menu-button"));
    expect(screen.getByTestId("sidebar-backdrop")).toBeInTheDocument();
  });

  it("clicking backdrop closes sidebar", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    fireEvent.click(screen.getByTestId("mobile-menu-button"));
    expect(screen.getByTestId("sidebar-backdrop")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("sidebar-backdrop"));
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });

  it("clicking nav link closes sidebar", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    fireEvent.click(screen.getByTestId("mobile-menu-button"));
    expect(screen.getByTestId("sidebar-backdrop")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Dashboard"));
    expect(screen.queryByTestId("sidebar-backdrop")).not.toBeInTheDocument();
  });
});
