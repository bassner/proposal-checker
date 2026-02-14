import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, getPreviousReviewsForFile, getPreviousVersionReviewId } from "@/lib/db";
import { compareReviews, fromVersionComparison } from "@/lib/review-improvement";
import type { MergedFeedback } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/review/[id]/improvement — Compare this review to the previous
 * review of the same file by the same user. Returns an improvement summary
 * or { available: false } if no previous review exists.
 *
 * Priority 1: Use LLM-powered versionComparison from feedback (if present).
 * Priority 2: Fall back to token-overlap compareReviews() for legacy reviews.
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
  if (review.status !== "done" || !review.feedback) {
    return Response.json({ available: false });
  }

  const currentFeedback = review.feedback as MergedFeedback;
  if (!currentFeedback.findings) {
    return Response.json({ available: false });
  }

  // Priority 1: Use LLM-powered versionComparison from feedback
  // Validate that the LLM-produced previousReviewId matches the actual version chain
  // to prevent data leakage from hallucinated/poisoned IDs.
  if (currentFeedback.versionComparison) {
    const vc = currentFeedback.versionComparison;
    const chainPrevId = await getPreviousVersionReviewId(id);
    if (chainPrevId && chainPrevId === vc.previousReviewId) {
      const prevReview = await getReviewById(vc.previousReviewId);
      if (prevReview && prevReview.userId === review.userId) {
        const prevFeedback = prevReview.feedback as MergedFeedback;
        if (prevFeedback?.findings) {
          const summary = fromVersionComparison(
            vc,
            prevFeedback.findings,
            currentFeedback.findings,
            prevReview.createdAt,
          );
          return Response.json({ available: true, ...summary });
        }
      }
    }
    // Chain mismatch or access failure — fall through to legacy matching
  }

  // Priority 2: Version chain lookup with token-overlap fallback
  const prevVersionId = await getPreviousVersionReviewId(id);
  if (prevVersionId) {
    const prevReview = await getReviewById(prevVersionId);
    if (prevReview) {
      const prevFeedback = prevReview.feedback as MergedFeedback;
      if (prevFeedback?.findings) {
        const summary = compareReviews(
          prevFeedback,
          currentFeedback,
          prevReview.createdAt,
          prevReview.id
        );
        return Response.json({ available: true, ...summary });
      }
    }
  }

  // Priority 3: Fall back to filename matching (legacy compat for unlinked reviews)
  if (!review.fileName) {
    return Response.json({ available: false });
  }

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
