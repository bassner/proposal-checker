import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewByShareToken, sanitizeAnnotations } from "@/lib/db";

const TOKEN_RE = /^[a-f0-9]{16}$/;

/**
 * GET /api/shared/[token] — Fetch a review by its share token.
 *
 * Requires authentication (any logged-in user) but no ownership check.
 * Returns review metadata and feedback for rendering the shared view.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!TOKEN_RE.test(token)) {
    return Response.json({ error: "Invalid share token" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewByShareToken(token);

  if (!review) {
    return Response.json({ error: "Shared review not found" }, { status: 404 });
  }

  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";

  return Response.json({
    id: review.id,
    status: review.status,
    provider: review.provider,
    reviewMode: review.reviewMode,
    fileName: review.fileName,
    createdAt: review.createdAt,
    feedback: review.feedback,
    userName: review.userName,
    annotations: sanitizeAnnotations(review.annotations),
    canComment: isSupervisor,
  });
}
