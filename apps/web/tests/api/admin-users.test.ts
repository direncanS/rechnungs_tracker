import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn(),
}));

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[id]/route";

function makeSession(overrides?: Partial<Session["user"]>): Session {
  return {
    user: {
      id: "owner1",
      email: "owner@test.com",
      name: "Owner",
      role: "OWNER",
      ...overrides,
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

const mockUser = {
  id: "u1",
  email: "user@test.com",
  name: "Test User",
  role: "ACCOUNTANT",
  isActive: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function callPOST(body: Record<string, unknown>) {
  const request = new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request);
}

function callPATCH(id: string, body: Record<string, unknown>) {
  const request = new Request(`http://localhost/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("uses verifyFromDb for privilege check", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    await GET();
    expect(requireRole).toHaveBeenCalledWith("OWNER", { verifyFromDb: true });
  });

  it("returns user list without passwordHash", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.user.findMany).mockResolvedValue([mockUser] as never);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].email).toBe("user@test.com");
    expect(body.items[0]).not.toHaveProperty("passwordHash");
    // Verify select is explicit (no passwordHash)
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, email: true }),
      })
    );
    expect(
      (vi.mocked(prisma.user.findMany).mock.calls[0][0] as Record<string, Record<string, boolean>>)
        .select.passwordHash
    ).toBeUndefined();
  });
});

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(hash).mockResolvedValue("hashed_password" as never);
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);
  });

  it("creates user and returns 201", async () => {
    const response = await callPOST({
      email: "new@test.com",
      name: "New User",
      password: "password123",
      role: "ACCOUNTANT",
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.email).toBe("user@test.com");
    expect(body).not.toHaveProperty("passwordHash");
    expect(hash).toHaveBeenCalledWith("password123", 12);
  });

  it("returns 400 for missing email", async () => {
    const response = await callPOST({
      name: "No Email",
      password: "password123",
      role: "WORKER",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/email/i);
  });

  it("returns 400 for invalid email format", async () => {
    const response = await callPOST({
      email: "not-an-email",
      name: "Bad Email",
      password: "password123",
      role: "WORKER",
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 for whitespace-only name", async () => {
    const response = await callPOST({
      email: "valid@test.com",
      name: "   ",
      password: "password123",
      role: "WORKER",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 for password shorter than 8 characters", async () => {
    const response = await callPOST({
      email: "valid@test.com",
      name: "Valid Name",
      password: "short",
      role: "WORKER",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/password/i);
  });

  it("returns 400 for invalid role", async () => {
    const response = await callPOST({
      email: "valid@test.com",
      name: "Valid Name",
      password: "password123",
      role: "SUPERADMIN",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/role/i);
  });

  it("returns 409 for duplicate email (P2002)", async () => {
    vi.mocked(prisma.user.create).mockRejectedValue({ code: "P2002" });
    const response = await callPOST({
      email: "existing@test.com",
      name: "Dupe",
      password: "password123",
      role: "WORKER",
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/email already exists/i);
  });
});

describe("PATCH /api/admin/users/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(makeSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "ACCOUNTANT",
      isActive: true,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);
  });

  it("updates role and returns 200", async () => {
    const response = await callPATCH("u1", { role: "OWNER" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("passwordHash");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: "OWNER" },
      })
    );
  });

  it("updates isActive and returns 200", async () => {
    const response = await callPATCH("u1", { isActive: false });
    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false },
      })
    );
  });

  it("returns 400 for empty body", async () => {
    const response = await callPATCH("u1", {});
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/at least one/i);
  });

  it("returns 404 for non-existent user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const response = await callPATCH("nonexistent", { role: "WORKER" });
    expect(response.status).toBe(404);
  });

  it("returns 409 when deactivating last active owner", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "owner1",
      role: "OWNER",
      isActive: true,
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    const response = await callPATCH("owner1", { isActive: false });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/last active owner/i);
  });

  it("returns 409 for mixed update on last owner (role + isActive)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "owner1",
      role: "OWNER",
      isActive: true,
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    const response = await callPATCH("owner1", {
      role: "ACCOUNTANT",
      isActive: false,
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/last active owner/i);
  });
});
