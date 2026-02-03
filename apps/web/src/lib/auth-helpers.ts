import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

const ROLE_HIERARCHY: Record<Role, number> = {
  WORKER: 0,
  ACCOUNTANT: 1,
  OWNER: 2,
};

interface RequireRoleOptions {
  verifyFromDb?: boolean;
}

/**
 * Checks that the current request has a valid session with at least the given role.
 *
 * - "WORKER" allows WORKER, ACCOUNTANT, OWNER
 * - "ACCOUNTANT" allows ACCOUNTANT, OWNER
 * - "OWNER" allows OWNER only
 *
 * With `verifyFromDb: true`, re-queries the DB for current role + isActive status.
 * Throws NextResponse (401/403) on failure — callers should let it propagate.
 */
export async function requireRole(
  minimumRole: Role,
  options?: RequireRoleOptions
): Promise<Session> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionRole = session.user.role as Role;

  if (options?.verifyFromDb) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
      throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbRole = dbUser.role;

    if (ROLE_HIERARCHY[dbRole] < ROLE_HIERARCHY[minimumRole]) {
      throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update session with DB values for downstream use
    session.user.role = dbRole;
    return session;
  }

  if (ROLE_HIERARCHY[sessionRole] < ROLE_HIERARCHY[minimumRole]) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return session;
}
