import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, toggleCommentReaction, getReactionsForComments } from "@/lib/db";
import type { Annotations } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_REACTIONS = ["thumbs_up", "lightbulb", "question", "check"] as const;

/**
 * GET /api/review/[id]/comments/[commentId]/reactions
 * Get reactions for a specific comment. Requires auth.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;

  try {
    await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const reactions = await getReactionsForComments([commentId]);

  return Response.json({
    ok: true,
    reactions: reactions[commentId] ?? [],
  });
}

/**
 * POST /api/review/[id]/comments/[commentId]/reactions
 * Toggle a reaction on a comment. Requires auth.
 * Body: { reaction: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;

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

  // Verify the review exists and is complete
  const review = await getReviewById(id);
  if (!review || review.status !== "done" || !review.feedback) {
    return Response.json({ error: "Review not found or not complete" }, { status: 404 });
  }

  // Verify the comment exists somewhere in the annotations
  const annotations: Annotations = review.annotations ?? {};
  let commentFound = false;
  for (const entry of Object.values(annotations)) {
    if (entry.comments?.some((c) => c.id === commentId)) {
      commentFound = true;
      break;
    }
  }
  if (!commentFound) {
    return Response.json({ error: "Comment not found" }, { status: 404 });
  }

  let body: { reaction?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reaction = typeof body.reaction === "string" ? body.reaction : "";
  if (!ALLOWED_REACTIONS.includes(reaction as typeof ALLOWED_REACTIONS[number])) {
    return Response.json(
      { error: `Invalid reaction. Allowed: ${ALLOWED_REACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const result = await toggleCommentReaction(
    commentId,
    session.user.id!,
    session.user.name ?? "Unknown",
    reaction
  );

  // Return updated reactions for this comment
  const reactions = await getReactionsForComments([commentId]);

  return Response.json({
    ok: true,
    action: result,
    reactions: reactions[commentId] ?? [],
  });
}
