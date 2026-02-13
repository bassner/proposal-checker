import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, getTagsForReview, addTag, removeTag, getPopularTags } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TAG_LENGTH = 50;
const TAG_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;

/**
 * GET /api/review/[id]/tags — List tags for a review.
 * Also returns popular tags for autocomplete when ?popular=true.
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

  // Access check: owner, admin, or phd can see tags
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const tags = await getTagsForReview(id);

  // Optionally include popular tags for autocomplete
  const url = request.nextUrl;
  if (url.searchParams.get("popular") === "true") {
    const popular = await getPopularTags();
    return Response.json({ tags, popularTags: popular });
  }

  return Response.json({ tags });
}

/**
 * POST /api/review/[id]/tags — Add a tag to a review.
 * Body: { tag: string }
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

  // Access check: owner, admin, or phd can add tags
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { tag?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawTag = typeof body.tag === "string" ? body.tag.trim().toLowerCase() : "";
  if (!rawTag) {
    return Response.json({ error: "Tag is required" }, { status: 400 });
  }
  if (rawTag.length > MAX_TAG_LENGTH) {
    return Response.json(
      { error: `Tag must be at most ${MAX_TAG_LENGTH} characters` },
      { status: 400 }
    );
  }
  if (!TAG_RE.test(rawTag)) {
    return Response.json(
      { error: "Tag must start with a letter or number and contain only letters, numbers, spaces, hyphens, or underscores" },
      { status: 400 }
    );
  }

  await addTag(id, rawTag, session.user.id!);
  const tags = await getTagsForReview(id);
  return Response.json({ ok: true, tags });
}

/**
 * DELETE /api/review/[id]/tags — Remove a tag from a review.
 * Body: { tag: string }
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

  // Access check: owner, admin, or phd can remove tags
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { tag?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawTag = typeof body.tag === "string" ? body.tag.trim().toLowerCase() : "";
  if (!rawTag) {
    return Response.json({ error: "Tag is required" }, { status: 400 });
  }

  await removeTag(id, rawTag);
  const tags = await getTagsForReview(id);
  return Response.json({ ok: true, tags });
}
