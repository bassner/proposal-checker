import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, markNotificationRead } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/notifications/[id] — Mark a single notification as read.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid notification ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const updated = await markNotificationRead(id, session.user.id!);

  if (!updated) {
    return Response.json({ error: "Notification not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
