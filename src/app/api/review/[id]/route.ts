import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, softDeleteReview, sanitizeAnnotations } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/review/[id] — Returns review metadata + feedback from DB.
 *
 * Used by the review page when the in-memory session is gone (server restart,
 * eviction after 10 min). Ownership check prevents IDOR — same 404 for missing
 * and unauthorized to avoid UUID enumeration.
 */
export async function GET(
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

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);

  // Normalize: same 404 for missing and unauthorized (IDOR prevention)
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;
  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";
  if (!isOwner && !isSupervisor) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  return Response.json({
    id: review.id,
    status: review.status,
    provider: review.provider,
    reviewMode: review.reviewMode,
    fileName: review.fileName,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    completedAt: review.completedAt,
    feedback: review.feedback,
    errorMessage: review.errorMessage,
    shareToken: review.shareToken,
    shareExpiresAt: review.shareExpiresAt,
    shareHasPassword: !!review.sharePasswordHash,
    annotations: sanitizeAnnotations(review.annotations),
    retryCount: review.retryCount,
    canRetry: !!review.pdfPath,
    isOwner,
  });
}

/**
 * DELETE /api/review/[id] — Soft-delete a review.
 *
 * Owners can delete their own reviews; admins can delete any review.
 * Returns 404 for missing/unauthorized (IDOR prevention).
 */
export async function DELETE(
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

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);

  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  await softDeleteReview(id);

  return Response.json({ ok: true });
}
