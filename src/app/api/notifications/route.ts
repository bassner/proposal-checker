import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getUnreadNotifications } from "@/lib/db";

/**
 * GET /api/notifications — List unread notifications for the current user.
 */
export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const notifications = await getUnreadNotifications(session.user.id!);

  return Response.json({ notifications });
}
