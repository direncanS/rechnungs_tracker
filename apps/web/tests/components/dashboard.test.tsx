import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "u1", name: "Admin User", email: "admin@test.com", role: "OWNER" },
      expires: "2099-01-01",
    },
    status: "authenticated",
  }),
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";

describe("DashboardPage", () => {
  it("shows welcome message with user name", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
  });

  it("shows user role label", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/owner/i)).toBeInTheDocument();
  });
});
