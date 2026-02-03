import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock next-auth getServerSession
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

// Mock next-auth/providers/credentials
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => ({
    ...config,
    type: "credentials",
    id: "credentials",
  })),
}));

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { compare } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { requireRole } from "@/lib/auth-helpers";

// Helper: extract the authorize function from authOptions
function getAuthorize() {
  const provider = authOptions.providers[0] as {
    options?: { authorize?: (credentials: Record<string, string>) => Promise<unknown> };
    authorize?: (credentials: Record<string, string>) => Promise<unknown>;
  };
  // next-auth credentials provider puts authorize in options or directly on the provider
  const authorize = provider.options?.authorize ?? provider.authorize;
  if (!authorize) {
    throw new Error("Could not find authorize function on credentials provider");
  }
  return authorize;
}

describe("NextAuth authorize callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when credentials are missing", async () => {
    const authorize = getAuthorize();
    const result = await authorize({ email: "", password: "" });
    expect(result).toBeNull();
  });

  it("returns null when user not found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const authorize = getAuthorize();
    const result = await authorize({
      email: "nonexistent@test.com",
      password: "password123",
    });
    expect(result).toBeNull();
  });

  it("returns null when user is deactivated", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "inactive@test.com",
      name: "Inactive",
      role: "OWNER" as Role,
      isActive: false,
      passwordHash: "hashedpw",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const authorize = getAuthorize();
    const result = await authorize({
      email: "inactive@test.com",
      password: "password123",
    });
    expect(result).toBeNull();
    // compare should not be called for inactive users
    expect(compare).not.toHaveBeenCalled();
  });

  it("returns null when password is wrong", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "admin@test.com",
      name: "Admin",
      role: "OWNER" as Role,
      isActive: true,
      passwordHash: "hashedpw",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(compare).mockResolvedValue(false as never);
    const authorize = getAuthorize();
    const result = await authorize({
      email: "admin@test.com",
      password: "wrongpassword",
    });
    expect(result).toBeNull();
  });

  it("returns user object (without passwordHash) on successful login", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "admin@test.com",
      name: "Admin",
      role: "OWNER" as Role,
      isActive: true,
      passwordHash: "hashedpw",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(compare).mockResolvedValue(true as never);
    const authorize = getAuthorize();
    const result = await authorize({
      email: "admin@test.com",
      password: "correctpassword",
    });
    expect(result).toEqual({
      id: "u1",
      email: "admin@test.com",
      name: "Admin",
      role: "OWNER",
    });
    // Ensure passwordHash is NOT in the result
    expect(result).not.toHaveProperty("passwordHash");
  });
});

describe("JWT callback", () => {
  it("embeds id, role, email, name in token on initial sign-in", async () => {
    const jwtCallback = authOptions.callbacks!.jwt!;
    const token = await jwtCallback({
      token: { sub: "u1" },
      user: { id: "u1", email: "admin@test.com", name: "Admin", role: "OWNER" as Role },
      account: null,
      trigger: "signIn",
    } as Parameters<typeof jwtCallback>[0]);
    expect(token.id).toBe("u1");
    expect(token.role).toBe("OWNER");
    expect(token.email).toBe("admin@test.com");
    expect(token.name).toBe("Admin");
  });
});

describe("Session callback", () => {
  it("exposes id, role, email, name in session.user", async () => {
    const sessionCallback = authOptions.callbacks!.session!;
    const session = await sessionCallback({
      session: { user: { id: "", email: "", name: "", role: "" as Role }, expires: "" },
      token: { id: "u1", role: "ACCOUNTANT", email: "acct@test.com", name: "Accountant", sub: "u1" },
    } as Parameters<typeof sessionCallback>[0]);
    const user = session.user as { id: string; role: string; email: string; name: string };
    expect(user.id).toBe("u1");
    expect(user.role).toBe("ACCOUNTANT");
    expect(user.email).toBe("acct@test.com");
    expect(user.name).toBe("Accountant");
    // passwordHash must not be present
    expect(user).not.toHaveProperty("passwordHash");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 401 when no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    try {
      await requireRole("WORKER");
      expect.unreachable("Should have thrown");
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(401);
    }
  });

  it("allows WORKER when minimumRole is WORKER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "w@test.com", name: "Worker", role: "WORKER" as Role },
      expires: "",
    });
    const session = await requireRole("WORKER");
    expect(session.user.role).toBe("WORKER");
  });

  it("allows ACCOUNTANT when minimumRole is WORKER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u2", email: "a@test.com", name: "Accountant", role: "ACCOUNTANT" as Role },
      expires: "",
    });
    const session = await requireRole("WORKER");
    expect(session.user.role).toBe("ACCOUNTANT");
  });

  it("allows OWNER when minimumRole is WORKER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u3", email: "o@test.com", name: "Owner", role: "OWNER" as Role },
      expires: "",
    });
    const session = await requireRole("WORKER");
    expect(session.user.role).toBe("OWNER");
  });

  it("blocks WORKER when minimumRole is ACCOUNTANT", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "w@test.com", name: "Worker", role: "WORKER" as Role },
      expires: "",
    });
    try {
      await requireRole("ACCOUNTANT");
      expect.unreachable("Should have thrown");
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(403);
    }
  });

  it("allows ACCOUNTANT when minimumRole is ACCOUNTANT", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u2", email: "a@test.com", name: "Accountant", role: "ACCOUNTANT" as Role },
      expires: "",
    });
    const session = await requireRole("ACCOUNTANT");
    expect(session.user.role).toBe("ACCOUNTANT");
  });

  it("blocks WORKER when minimumRole is OWNER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "w@test.com", name: "Worker", role: "WORKER" as Role },
      expires: "",
    });
    try {
      await requireRole("OWNER");
      expect.unreachable("Should have thrown");
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(403);
    }
  });

  it("blocks ACCOUNTANT when minimumRole is OWNER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u2", email: "a@test.com", name: "Accountant", role: "ACCOUNTANT" as Role },
      expires: "",
    });
    try {
      await requireRole("OWNER");
      expect.unreachable("Should have thrown");
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(403);
    }
  });

  it("allows OWNER when minimumRole is OWNER", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u3", email: "o@test.com", name: "Owner", role: "OWNER" as Role },
      expires: "",
    });
    const session = await requireRole("OWNER");
    expect(session.user.role).toBe("OWNER");
  });

  it("returns 401 for deactivated user with verifyFromDb", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u3", email: "o@test.com", name: "Owner", role: "OWNER" as Role },
      expires: "",
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u3",
      email: "o@test.com",
      name: "Owner",
      role: "OWNER" as Role,
      isActive: false,
      passwordHash: "hashedpw",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    try {
      await requireRole("OWNER", { verifyFromDb: true });
      expect.unreachable("Should have thrown");
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(401);
    }
  });

  it("allows active user with correct role using verifyFromDb", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u3", email: "o@test.com", name: "Owner", role: "OWNER" as Role },
      expires: "",
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u3",
      email: "o@test.com",
      name: "Owner",
      role: "OWNER" as Role,
      isActive: true,
      passwordHash: "hashedpw",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const session = await requireRole("OWNER", { verifyFromDb: true });
    expect(session.user.role).toBe("OWNER");
  });

  it("returns 403 when DB role is lower than required with verifyFromDb", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "w@test.com", name: "Worker", role: "OWNER" as Role }, // stale JWT says OWNER
      expires: "",
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "w@test.com",
      name: "Worker",
      role: "WORKER" as Role, // DB says WORKER (demoted)
      isActive: true,
      passwordHash: "hashedpw",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    try {
      await requireRole("OWNER", { verifyFromDb: true });
      expect.unreachable("Should have thrown");
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(403);
    }
  });
});
