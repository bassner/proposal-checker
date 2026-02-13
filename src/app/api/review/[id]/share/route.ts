import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, shareReview, unshareReview } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/review/[id]/share — Generate a share link for a completed review.
 *
 * Requires ownership (or admin). Returns 409 if the review is not done yet.
 * Idempotent: returns the existing share token if already shared.
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

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);

  // Same 404 for missing and unauthorized (IDOR prevention)
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  if (review.status !== "done") {
    return Response.json(
      { error: "Only completed reviews can be shared" },
      { status: 409 }
    );
  }

  const shareToken = await shareReview(id);

  return Response.json({
    shareToken,
    shareUrl: `/shared/${shareToken}`,
  });
}

/**
 * DELETE /api/review/[id]/share — Revoke the share link for a review.
 *
 * Requires ownership (or admin). Returns 204 on success.
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

  await unshareReview(id);

  return new Response(null, { status: 204 });
}
