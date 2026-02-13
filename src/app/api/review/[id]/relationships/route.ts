import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getRelationshipsForReview,
  createProposalRelationship,
  deleteProposalRelationship,
  getProposalRelationshipById,
  queryReviews,
} from "@/lib/db";
import type { RelationshipType } from "@/lib/db";
import { NextRequest } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TYPES = new Set<RelationshipType>([
  "similar_topic",
  "shared_advisor",
  "builds_upon",
  "contradicts",
  "related",
]);

/**
 * GET /api/review/[id]/relationships — List all relationships for this review.
 * Optionally ?search=<text> returns matching reviews for the target picker.
 */
export async function GET(
  request: NextRequest,
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

  // Access check: owner, admin, or phd can see relationships
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // If ?search=<text> is provided, return matching reviews for the target picker
  const searchQuery = request.nextUrl.searchParams.get("search");
  if (searchQuery !== null) {
    // Admin/phd see all reviews; students see only their own
    const userId = role === "admin" || role === "phd" ? undefined : session.user.id!;
    const candidates = await queryReviews({
      userId,
      limit: 20,
      offset: 0,
      search: searchQuery || undefined,
      sortBy: "created_at",
      sortDir: "desc",
    });
    // Exclude the current review from candidates
    const filtered = candidates
      .filter((r) => r.id !== id)
      .map((r) => ({
        id: r.id,
        fileName: r.fileName,
        userName: r.userName,
        createdAt: r.createdAt,
      }));
    return Response.json({ candidates: filtered });
  }

  const relationships = await getRelationshipsForReview(id);
  return Response.json({ relationships });
}

/**
 * POST /api/review/[id]/relationships — Create a new relationship.
 * Body: { targetReviewId: string, relationshipType: string, notes?: string }
 * Requires admin or phd role.
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
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { targetReviewId?: unknown; relationshipType?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetReviewId = typeof body.targetReviewId === "string" ? body.targetReviewId : "";
  if (!targetReviewId || !UUID_RE.test(targetReviewId)) {
    return Response.json({ error: "Invalid targetReviewId" }, { status: 400 });
  }

  if (targetReviewId === id) {
    return Response.json({ error: "Cannot create a relationship with itself" }, { status: 400 });
  }

  const relationshipType = typeof body.relationshipType === "string" ? body.relationshipType : "";
  if (!VALID_TYPES.has(relationshipType as RelationshipType)) {
    return Response.json({ error: "Invalid relationshipType" }, { status: 400 });
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  // Verify target review exists
  const targetReview = await getReviewById(targetReviewId);
  if (!targetReview) {
    return Response.json({ error: "Target review not found" }, { status: 404 });
  }

  const created = await createProposalRelationship({
    sourceReviewId: id,
    targetReviewId,
    relationshipType: relationshipType as RelationshipType,
    notes,
    createdBy: session.user.id!,
    createdByName: session.user.name ?? null,
  });

  if (!created) {
    return Response.json({ error: "Relationship already exists" }, { status: 409 });
  }

  const relationships = await getRelationshipsForReview(id);
  return Response.json({ ok: true, relationships });
}

/**
 * DELETE /api/review/[id]/relationships — Remove a relationship.
 * Body: { relationshipId: string }
 * Requires admin or phd role.
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

  let body: { relationshipId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const relationshipId = typeof body.relationshipId === "string" ? body.relationshipId : "";
  if (!relationshipId || !UUID_RE.test(relationshipId)) {
    return Response.json({ error: "Invalid relationshipId" }, { status: 400 });
  }

  // Verify the relationship belongs to this review
  const rel = await getProposalRelationshipById(relationshipId);
  if (!rel || (rel.sourceReviewId !== id && rel.targetReviewId !== id)) {
    return Response.json({ error: "Relationship not found" }, { status: 404 });
  }

  await deleteProposalRelationship(relationshipId);
  const relationships = await getRelationshipsForReview(id);
  return Response.json({ ok: true, relationships });
}
