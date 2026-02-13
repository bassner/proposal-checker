import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, markAllNotificationsRead } from "@/lib/db";

/**
 * POST /api/notifications/mark-all-read — Mark all notifications as read for the current user.
 */
export async function POST() {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  await markAllNotificationsRead(session.user.id!);

  return Response.json({ ok: true });
}
