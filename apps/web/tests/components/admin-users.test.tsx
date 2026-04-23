import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import AdminUsersPage from "@/app/(dashboard)/admin/users/page";

const mockUsers = {
  items: [
    {
      id: "u1",
      email: "admin@test.com",
      name: "Admin User",
      role: "OWNER",
      isActive: true,
      createdAt: "2024-01-01T10:00:00Z",
    },
    {
      id: "u2",
      email: "worker@test.com",
      name: "Worker User",
      role: "WORKER",
      isActive: true,
      createdAt: "2024-02-01T10:00:00Z",
    },
  ],
};

function mockFetchSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockUsers),
  });
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state initially", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    render(<AdminUsersPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders user table with data", async () => {
    mockFetchSuccess();
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("user-table")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("user-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("worker@test.com")).toBeInTheDocument();
  });

  it("shows create user form on button click", async () => {
    mockFetchSuccess();
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("user-table")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("create-user-button"));
    expect(screen.getByTestId("user-form")).toBeInTheDocument();
  });

  it("create user submits POST and re-fetches list", async () => {
    mockFetchSuccess();
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("user-table")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("create-user-button"));

    // POST success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "u3" }),
    });
    // Re-fetch after create
    mockFetchSuccess();

    fireEvent.change(screen.getByTestId("user-form-email"), {
      target: { value: "new@test.com" },
    });
    fireEvent.change(screen.getByTestId("user-form-name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByTestId("user-form-password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("user-form-submit"));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, string>)?.method === "POST"
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1].body);
      expect(body.email).toBe("new@test.com");
      expect(body.name).toBe("New User");
      expect(body.role).toBe("WORKER");
    });
  });

  it("role change sends PATCH with new role", async () => {
    mockFetchSuccess();
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("user-table")).toBeInTheDocument();
    });

    // PATCH success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    // Re-fetch after PATCH
    mockFetchSuccess();

    const selects = screen.getAllByTestId("role-select");
    fireEvent.change(selects[1], { target: { value: "ACCOUNTANT" } });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, string>)?.method === "PATCH"
      );
      expect(patchCall).toBeTruthy();
      expect(patchCall![0]).toContain("/api/admin/users/u2");
      const body = JSON.parse(patchCall![1].body);
      expect(body.role).toBe("ACCOUNTANT");
    });
  });

  it("role change PATCH failure triggers re-fetch and shows mutation error", async () => {
    mockFetchSuccess();
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("user-table")).toBeInTheDocument();
    });

    // PATCH failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal server error" }),
    });
    // Re-fetch after failure (rollback)
    mockFetchSuccess();

    const selects = screen.getAllByTestId("role-select");
    fireEvent.change(selects[0], { target: { value: "WORKER" } });

    await waitFor(() => {
      expect(screen.getByTestId("mutation-error")).toBeInTheDocument();
      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });

    // Verify re-fetch was called (3 calls total: initial load + PATCH + re-fetch)
    await waitFor(() => {
      const getCalls = mockFetch.mock.calls.filter(
        (c: unknown[]) => {
          const opts = c[1] as Record<string, string> | undefined;
          return !opts?.method || opts?.method === "GET";
        }
      );
      expect(getCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("toggle active shows 409 error for last-owner protection", async () => {
    mockFetchSuccess();
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId("user-table")).toBeInTheDocument();
    });

    // PATCH 409
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: "Cannot deactivate the last active owner",
        }),
    });
    // Re-fetch after failure
    mockFetchSuccess();

    const toggleButtons = screen.getAllByTestId("toggle-active");
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("mutation-error")).toBeInTheDocument();
      expect(
        screen.getByText("Cannot deactivate the last active owner")
      ).toBeInTheDocument();
    });
  });
});
