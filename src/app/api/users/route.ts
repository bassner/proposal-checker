import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, searchUsers, getAllUsers, getUsersByRole } from "@/lib/db";
import type { UserRow } from "@/lib/db";
import type { AppRole } from "@/lib/auth/roles";
import { ROLE_HIERARCHY } from "@/lib/auth/roles";

const VALID_ROLES = new Set<AppRole>(["admin", "phd", "student"]);

/** Strip sensitive fields for non-admin callers. Only returns id, name, role. */
function sanitizeUser(user: UserRow): { id: string; name: string; role: string } {
  return { id: user.id, name: user.name, role: user.role };
}

/**
 * GET /api/users — Search users or list by role.
 *
 * Query params:
 *   - q: search query (name or email for admins, name-only for others)
 *   - role: filter by role (admin | phd | student), supports comma-separated for multiple roles
 *
 * Response is stripped for non-admin callers: only id, name, role are returned.
 * Admins get the full record (email, timestamps).
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const callerRole = session.user.role;
  const isAdmin = ROLE_HIERARCHY[callerRole] >= ROLE_HIERARCHY.admin;

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const roleParam = url.searchParams.get("role");

  // Support comma-separated roles: ?role=phd,admin
  let roles: AppRole[] | undefined;
  let singleRole: AppRole | undefined;
  if (roleParam) {
    const parts = roleParam.split(",").map((r) => r.trim()).filter((r) => VALID_ROLES.has(r as AppRole)) as AppRole[];
    if (parts.length === 1) {
      singleRole = parts[0];
    } else if (parts.length > 1) {
      roles = parts;
    }
  }

  let users: UserRow[];

  if (query) {
    users = await searchUsers(query, singleRole, roles);
  } else if (roles && roles.length > 0) {
    // Multiple roles: fetch each and combine
    const results = await Promise.all(roles.map((r) => getUsersByRole(r)));
    users = results.flat();
  } else if (singleRole) {
    users = await getUsersByRole(singleRole);
  } else {
    users = await getAllUsers();
  }

  // Admins get full records; everyone else gets sanitized (id, name, role only)
  if (isAdmin) {
    return Response.json({ users });
  }
  return Response.json({ users: users.map(sanitizeUser) });
}
