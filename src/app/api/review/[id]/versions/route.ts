import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getVersionGroup,
  linkReviewVersion,
  unlinkReviewVersion,
} from "@/lib/db";
import type { ReviewRow } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/review/[id]/versions — Get all versions linked to this review's version group.
 * Returns { groupId, versions: [{ reviewId, versionNumber, createdAt, fileName, status }] }
 * or { groupId: null, versions: [] } if not part of any group.
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

  // Access check: owner, admin, or phd
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const group = await getVersionGroup(id);
  if (!group) {
    return Response.json({ groupId: null, versions: [] });
  }

  // Enrich versions with review metadata
  const enriched = await Promise.all(
    group.versions.map(async (v) => {
      const r = await getReviewById(v.reviewId);
      return {
        reviewId: v.reviewId,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        fileName: r?.fileName ?? null,
        status: r?.status ?? "unknown",
        findingCount: countFindings(r),
      };
    })
  );

  return Response.json({ groupId: group.groupId, versions: enriched });
}

/**
 * POST /api/review/[id]/versions — Link another review as a version in this review's group.
 * Body: { linkedReviewId: string }
 * If this review is not yet in a version group, creates one with this review as v1
 * and the linked review as v2.
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

  let body: { linkedReviewId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const linkedId = typeof body.linkedReviewId === "string" ? body.linkedReviewId.trim() : "";
  if (!linkedId || !UUID_RE.test(linkedId)) {
    return Response.json({ error: "Valid linkedReviewId is required" }, { status: 400 });
  }

  if (linkedId === id) {
    return Response.json({ error: "Cannot link a review to itself" }, { status: 400 });
  }

  // Check the linked review exists and user has access
  const linkedReview = await getReviewById(linkedId);
  if (!linkedReview) {
    return Response.json({ error: "Linked review not found" }, { status: 404 });
  }
  if (linkedReview.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Linked review not found" }, { status: 404 });
  }

  // Check if the linked review is already in a different group
  const linkedGroup = await getVersionGroup(linkedId);
  const currentGroup = await getVersionGroup(id);

  if (linkedGroup && currentGroup && linkedGroup.groupId !== currentGroup.groupId) {
    return Response.json(
      { error: "The linked review is already part of a different version group" },
      { status: 409 }
    );
  }

  // Ensure current review is in a group first
  let groupId: string;
  if (currentGroup) {
    groupId = currentGroup.groupId;
  } else {
    // Create a new group with this review as v1
    const v1 = await linkReviewVersion(id);
    groupId = v1.groupId;
  }

  // Add the linked review to the group (if not already there)
  if (!linkedGroup || linkedGroup.groupId !== groupId) {
    await linkReviewVersion(linkedId, groupId);
  }

  // Return the updated group
  const updatedGroup = await getVersionGroup(id);
  const enriched = await Promise.all(
    (updatedGroup?.versions ?? []).map(async (v) => {
      const r = await getReviewById(v.reviewId);
      return {
        reviewId: v.reviewId,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        fileName: r?.fileName ?? null,
        status: r?.status ?? "unknown",
        findingCount: countFindings(r),
      };
    })
  );

  return Response.json({ groupId, versions: enriched });
}

/**
 * DELETE /api/review/[id]/versions — Unlink this review from its version group.
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

  // Access check: owner, admin, or phd
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  await unlinkReviewVersion(id);
  return Response.json({ ok: true });
}

/** Count findings from a review's feedback JSON. */
function countFindings(review: ReviewRow | null): number {
  if (!review?.feedback) return 0;
  const fb = review.feedback as { findings?: unknown[] };
  return Array.isArray(fb.findings) ? fb.findings.length : 0;
}
