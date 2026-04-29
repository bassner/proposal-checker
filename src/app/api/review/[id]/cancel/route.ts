import { requireAuth } from "@/lib/auth/helpers";
import { cancelSession, getSession } from "@/lib/sessions";
import { failReview, logAuditEvent } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/review/[id]/cancel — Cancel a running review.
 *
 * Aborts the in-flight pipeline, emits a final error event ("Cancelled by
 * user") to connected SSE clients, and persists the failure in the DB.
 * Returns 200 on success, 404 if no running session exists for that ID,
 * 403 if the caller doesn't own it.
 */
export async function POST(
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
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  const reviewSession = getSession(id);
  if (!reviewSession) {
    return Response.json({ error: "Review not found or already finished" }, { status: 404 });
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin && reviewSession.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cancelled = cancelSession(id, "Cancelled by user");
  if (!cancelled) {
    return Response.json({ error: "Review already finished" }, { status: 409 });
  }

  // Persist the cancellation in the DB so the review list reflects it.
  failReview(id, "Cancelled by user", {
    userId: reviewSession.userId,
    userEmail: reviewSession.userEmail,
    userName: reviewSession.userName,
    provider: reviewSession.provider,
    reviewMode: reviewSession.mode,
    fileName: reviewSession.fileName,
    supervisorId: reviewSession.supervisorId,
    studentId: reviewSession.studentId,
  }).catch((err) => console.error("[api] cancel: failReview failed:", err));

  logAuditEvent(id, session.user.id, session.user.email ?? null, "review.cancelled", {}, session.user.name);

  return Response.json({ ok: true });
}
