import { createHash } from "crypto";
import { requireAuth, canAccessReview } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, softDeleteReview, sanitizeAnnotations, logAuditEvent } from "@/lib/db";
import type { ReviewRow } from "@/lib/db";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cache key for a review's DB row. */
function reviewCacheKey(id: string): string {
  return `review:${id}`;
}

/**
 * GET /api/review/[id] — Returns review metadata + feedback from DB.
 *
 * Uses an in-memory cache to avoid repeated DB lookups for completed reviews.
 * Only completed ("done" / "error") reviews are cached — "running" reviews
 * are always fetched live. Responds with ETag / 304 for conditional requests.
 *
 * Used by the review page when the in-memory session is gone (server restart,
 * eviction after 10 min). Ownership check prevents IDOR — same 404 for missing
 * and unauthorized to avoid UUID enumeration.
 */
export async function GET(
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

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  // Try cache first
  let review = cacheGet<ReviewRow>(reviewCacheKey(id));
  const cacheHit = !!review;

  if (!review) {
    if (!(await isAvailable())) {
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }

    review = (await getReviewById(id)) ?? undefined;

    // Cache completed reviews (done/error) — running reviews change frequently
    if (review && review.status !== "running") {
      cacheSet(reviewCacheKey(id), review);
    }
  }

  // Normalize: same 404 for missing and unauthorized (IDOR prevention)
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  if (!canAccessReview(session, review)) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;

  const body = {
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
    workflowStatus: review.workflowStatus,
    supervisorId: review.supervisorId,
    studentId: review.studentId,
    supervisorName: review.supervisorName,
    studentName: review.studentName,
  };

  // ETag based on response content hash (includes isOwner so it's user-specific)
  const json = JSON.stringify(body);
  const etag = `"${createHash("md5").update(json).digest("hex")}"`;

  // Handle conditional request (If-None-Match)
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "X-Cache": cacheHit ? "HIT" : "MISS",
      },
    });
  }

  return new Response(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      "X-Cache": cacheHit ? "HIT" : "MISS",
    },
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

  // DELETE: only the uploader (user_id) or admin can delete
  const isOwner = review.userId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  await softDeleteReview(id);

  // Invalidate cache for this review
  cacheInvalidate(reviewCacheKey(id));

  // Audit log (fire-and-forget)
  logAuditEvent(id, session.user.id, session.user.email ?? null, "review.deleted", {
    fileName: review.fileName,
  }, session.user.name);

  return Response.json({ ok: true });
}
