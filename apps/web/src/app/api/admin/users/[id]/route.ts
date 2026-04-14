import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = Object.values(Role);

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("OWNER", { verifyFromDb: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { role, isActive } = body as {
    role?: string;
    isActive?: boolean;
  };

  // At least one field required
  if (role === undefined && isActive === undefined) {
    return NextResponse.json(
      { error: "At least one of role or isActive is required" },
      { status: 400 }
    );
  }

  // Validate role if provided
  if (role !== undefined && !VALID_ROLES.includes(role as Role)) {
    return NextResponse.json(
      { error: `Invalid role: must be one of ${VALID_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate isActive if provided
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive must be a boolean" },
      { status: 400 }
    );
  }

  // Fetch existing user
  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  });

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Last-owner protection: compute post-update state
  const finalRole = role !== undefined ? role : existingUser.role;
  const finalIsActive =
    isActive !== undefined ? isActive : existingUser.isActive;

  // If target is currently an active OWNER and would no longer be one after update
  if (
    existingUser.role === "OWNER" &&
    existingUser.isActive &&
    (finalRole !== "OWNER" || finalIsActive === false)
  ) {
    const otherActiveOwners = await prisma.user.count({
      where: {
        id: { not: id },
        role: "OWNER",
        isActive: true,
      },
    });

    if (otherActiveOwners === 0) {
      return NextResponse.json(
        { error: "Cannot remove the last active owner" },
        { status: 409 }
      );
    }
  }

  // Build update data — only include provided fields
  const data: Record<string, unknown> = {};
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = isActive;

  const updatedUser = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });

  return NextResponse.json(updatedUser);
}
