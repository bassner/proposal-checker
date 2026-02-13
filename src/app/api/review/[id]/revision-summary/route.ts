import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getVersionGroup,
  getRevisionSummary,
  generateRevisionSummary,
  listRevisionSummariesForReview,
} from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/review/[id]/revision-summary — Return the revision summary comparing
 * this review to its previous version in the version group (if one exists).
 * If ?oldReviewId=<uuid> is provided, returns the specific comparison.
 * Otherwise, returns all summaries where this review is the "new" side.
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

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Access check: owner, admin, or phd
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const oldReviewId = url.searchParams.get("oldReviewId");

  // Specific comparison requested
  if (oldReviewId) {
    if (!UUID_RE.test(oldReviewId)) {
      return Response.json({ error: "Invalid oldReviewId" }, { status: 400 });
    }
    const summary = await getRevisionSummary(oldReviewId, id);
    if (!summary) {
      return Response.json({ available: false });
    }
    return Response.json({ available: true, ...summary });
  }

  // Return all summaries for this review (as the "new" side)
  const summaries = await listRevisionSummariesForReview(id);
  if (summaries.length === 0) {
    // Try auto-generating from version group
    const group = await getVersionGroup(id);
    if (group && group.versions.length >= 2) {
      // Find this review's version number
      const thisVersion = group.versions.find((v) => v.reviewId === id);
      if (thisVersion && thisVersion.versionNumber > 1) {
        // Find the previous version
        const prevVersion = group.versions.find(
          (v) => v.versionNumber === thisVersion.versionNumber - 1
        );
        if (prevVersion) {
          const generated = await generateRevisionSummary(prevVersion.reviewId, id);
          if (generated) {
            return Response.json({ available: true, ...generated });
          }
        }
      }
    }
    return Response.json({ available: false });
  }

  // Return the most recent summary
  return Response.json({ available: true, ...summaries[0] });
}

/**
 * POST /api/review/[id]/revision-summary — Generate or regenerate the revision
 * summary comparing this review to the specified old review.
 * Body: { oldReviewId: string }
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

  // Access check: owner, admin, or phd
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { oldReviewId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const oldReviewId =
    typeof body.oldReviewId === "string" ? body.oldReviewId.trim() : "";
  if (!oldReviewId || !UUID_RE.test(oldReviewId)) {
    return Response.json(
      { error: "Valid oldReviewId is required" },
      { status: 400 }
    );
  }

  if (oldReviewId === id) {
    return Response.json(
      { error: "Cannot compare a review to itself" },
      { status: 400 }
    );
  }

  // Check the old review exists and user has access
  const oldReview = await getReviewById(oldReviewId);
  if (!oldReview) {
    return Response.json({ error: "Old review not found" }, { status: 404 });
  }
  if (
    oldReview.userId !== session.user.id &&
    role !== "admin" &&
    role !== "phd"
  ) {
    return Response.json({ error: "Old review not found" }, { status: 404 });
  }

  const summary = await generateRevisionSummary(oldReviewId, id);
  if (!summary) {
    return Response.json(
      { error: "Could not generate summary — both reviews must be completed with feedback" },
      { status: 422 }
    );
  }

  return Response.json(summary);
}
