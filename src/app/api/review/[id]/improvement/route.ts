import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, getPreviousReviewsForFile } from "@/lib/db";
import { compareReviews } from "@/lib/review-improvement";
import type { MergedFeedback } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/review/[id]/improvement — Compare this review to the previous
 * review of the same file by the same user. Returns an improvement summary
 * or { available: false } if no previous review exists.
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

  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Ownership check — only the owner can see improvement data
  const isOwner = review.userId === session.user.id;
  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";
  if (!isOwner && !isSupervisor) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Must be a completed review with feedback
  if (review.status !== "done" || !review.feedback || !review.fileName) {
    return Response.json({ available: false });
  }

  const currentFeedback = review.feedback as MergedFeedback;
  if (!currentFeedback.findings) {
    return Response.json({ available: false });
  }

  // Find previous reviews of the same file by the same user
  const previousReviews = await getPreviousReviewsForFile(
    review.userId,
    review.fileName,
    id
  );

  if (previousReviews.length === 0) {
    return Response.json({ available: false });
  }

  // Use the most recent previous review (first in DESC order)
  const prevReview = previousReviews[0];
  const prevFeedback = prevReview.feedback as MergedFeedback;

  if (!prevFeedback?.findings) {
    return Response.json({ available: false });
  }

  const summary = compareReviews(
    prevFeedback,
    currentFeedback,
    prevReview.createdAt,
    prevReview.id
  );

  return Response.json({
    available: true,
    ...summary,
  });
}
