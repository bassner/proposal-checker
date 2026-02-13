import "server-only";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import type { AppRole } from "@/lib/auth/roles";
import { ROLE_HIERARCHY } from "@/lib/auth/roles";
import { upsertUser } from "@/lib/db";

/**
 * Require an authenticated user with a recognized role.
 * Returns the session or throws a Response (JSON 401/403/503).
 *
 * Convention: every API route MUST call this as its first line, except:
 * - /api/health (public healthcheck)
 * - /api/auth/[...nextauth] (login/callback flow)
 * - /api/auth/federated-signout (logout flow)
 */
export async function requireAuth(): Promise<Session> {
  let session: Session | null;
  try {
    session = await auth();
  } catch (err) {
    console.error("[auth] Failed to validate session:", err);
    throw Response.json(
      { error: "Authentication service unavailable" },
      { status: 503 }
    );
  }

  if (!session?.user) {
    throw Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.id) {
    throw Response.json(
      { error: "Forbidden: missing user identity" },
      { status: 403 }
    );
  }
  if (!session.user.role) {
    throw Response.json(
      { error: "Forbidden: no recognized role assigned" },
      { status: 403 }
    );
  }
  if (session.error) {
    throw Response.json(
      { error: "Session expired — please re-authenticate" },
      { status: 401 }
    );
  }

  // Fire-and-forget: sync user to the users directory table.
  // Uses in-memory dedup to avoid DB calls on every request.
  upsertUser(
    session.user.id,
    session.user.email ?? "",
    session.user.name ?? "",
    session.user.role,
  ).catch((err) => console.error("[auth] User upsert failed:", err));

  return session;
}

/**
 * Check whether a user can access a review (read-level).
 * Admins can access any review. Others can access if they are the uploader,
 * the assigned student, or the assigned supervisor.
 */
export function canAccessReview(
  session: Session,
  review: { userId: string; studentId?: string | null; supervisorId?: string | null }
): boolean {
  if (session.user.role === "admin") return true;
  const uid = session.user.id;
  return uid === review.userId || uid === review.studentId || uid === review.supervisorId;
}

/**
 * Require a specific role (or higher). Calls requireAuth() internally.
 * Returns the session or throws a Response (JSON 401/403/503).
 */
export async function requireRole(role: AppRole): Promise<Session> {
  const session = await requireAuth();
  if (ROLE_HIERARCHY[session.user.role] < ROLE_HIERARCHY[role]) {
    throw Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }
  return session;
}
