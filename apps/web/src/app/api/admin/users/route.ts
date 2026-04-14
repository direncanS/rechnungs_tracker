import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = Object.values(Role);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function GET() {
  try {
    await requireRole("OWNER", { verifyFromDb: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: users });
}

export async function POST(request: Request) {
  try {
    await requireRole("OWNER", { verifyFromDb: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, name, password, role } = body as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  };

  // Validate email
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 }
    );
  }

  // Validate name — trim then reject if empty
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Validate password
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Validate role
  if (!role || !VALID_ROLES.includes(role as Role)) {
    return NextResponse.json(
      { error: `Invalid role: must be one of ${VALID_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const passwordHash = await hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: trimmedName,
        passwordHash,
        role: role as Role,
      },
      select: USER_SELECT,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}
