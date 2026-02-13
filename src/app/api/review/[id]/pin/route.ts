import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, pinReview, unpinReview } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/review/[id]/pin — Pin a review for the current user.
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
  const isAdmin = session.user.role === "admin";

  // Users can only pin their own reviews; admins can pin any
  if (!review || (!isAdmin && review.userId !== session.user.id)) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  await pinReview(session.user.id, id);
  return Response.json({ ok: true, pinned: true });
}

/**
 * DELETE /api/review/[id]/pin — Unpin a review for the current user.
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

  await unpinReview(session.user.id, id);
  return Response.json({ ok: true, pinned: false });
}
