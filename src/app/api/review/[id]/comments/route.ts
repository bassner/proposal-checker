import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, addComment, deleteComment, sanitizeAnnotations, insertNotification, logAuditEvent } from "@/lib/db";
import type { MergedFeedback, Comment } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INDEX_RE = /^\d+$/;
const MAX_COMMENT_LENGTH = 2000;

/**
 * POST /api/review/[id]/comments — Add a supervisor comment on a finding.
 *
 * Body: { findingIndex: number, text: string }
 * Only admin/phd roles can comment. Server injects author info from session.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "phd") {
    return Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review || review.status !== "done" || !review.feedback) {
    return Response.json({ error: "Review not found or not complete" }, { status: 404 });
  }

  let body: { findingIndex?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const findingIndex = String(body.findingIndex ?? "");
  if (!INDEX_RE.test(findingIndex)) {
    return Response.json({ error: "Invalid findingIndex" }, { status: 400 });
  }

  const feedback = review.feedback as MergedFeedback;
  const idx = parseInt(findingIndex, 10);
  if (idx >= (feedback.findings?.length ?? 0)) {
    return Response.json({ error: "Finding index out of bounds" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_COMMENT_LENGTH) {
    return Response.json(
      { error: `Comment text must be 1-${MAX_COMMENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  const comment: Comment = {
    id: crypto.randomUUID(),
    text,
    authorName: session.user.name ?? "Unknown",
    authorId: session.user.id!,
    createdAt: new Date().toISOString(),
  };

  const updated = await addComment(id, findingIndex, comment);

  // Audit log (fire-and-forget)
  logAuditEvent(id, session.user.id, session.user.email ?? null, "comment.added", {
    findingIndex: idx, commentId: comment.id,
  });

  // Notify the review owner (skip if the commenter IS the owner)
  if (review.userId !== session.user.id) {
    const authorName = session.user.name ?? "A supervisor";
    insertNotification({
      userId: review.userId,
      reviewId: id,
      type: "comment",
      message: `${authorName} commented on a finding in "${review.fileName ?? "your review"}"`,
    }).catch((err) => console.error("[notifications] Failed to insert:", err));
  }

  return Response.json({
    ok: true,
    annotations: sanitizeAnnotations(updated),
  });
}

/**
 * DELETE /api/review/[id]/comments — Remove a supervisor comment.
 *
 * Body: { findingIndex: number, commentId: string }
 * Admin can delete any comment. PHD can only delete their own.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "phd") {
    return Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { findingIndex?: unknown; commentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const findingIndex = String(body.findingIndex ?? "");
  if (!INDEX_RE.test(findingIndex)) {
    return Response.json({ error: "Invalid findingIndex" }, { status: 400 });
  }

  const commentId = typeof body.commentId === "string" ? body.commentId : "";
  if (!commentId) {
    return Response.json({ error: "Missing commentId" }, { status: 400 });
  }

  // Authorization check: phd can only delete own comments
  if (role === "phd") {
    const entry = review.annotations[findingIndex];
    const comment = entry?.comments?.find((c) => c.id === commentId);
    if (!comment || comment.authorId !== session.user.id) {
      return Response.json({ error: "Forbidden: can only delete own comments" }, { status: 403 });
    }
  }

  const updated = await deleteComment(id, findingIndex, commentId);

  // Audit log (fire-and-forget)
  logAuditEvent(id, session.user.id, session.user.email ?? null, "comment.deleted", {
    findingIndex: parseInt(findingIndex, 10), commentId,
  });

  return Response.json({
    ok: true,
    annotations: sanitizeAnnotations(updated),
  });
}
