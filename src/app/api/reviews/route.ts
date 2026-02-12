import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getAllReviews, getReviewsByUser, getReviewCount } from "@/lib/db";

const MAX_PAGE = 1000; // Prevent excessive OFFSET scans

/**
 * GET /api/reviews?page=1&limit=20
 *
 * Returns paginated reviews. Admin sees all; others see only their own.
 */
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const url = request.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

  // Prevent excessive DB load from large OFFSET values
  if (page > MAX_PAGE) {
    return Response.json(
      { error: `Page number too large (max: ${MAX_PAGE})` },
      { status: 400 }
    );
  }

  const offset = (page - 1) * limit;

  const isAdmin = session.user.role === "admin";
  const userId = session.user.id;

  const [reviews, total] = await Promise.all([
    isAdmin ? getAllReviews(limit, offset) : getReviewsByUser(userId, limit, offset),
    isAdmin ? getReviewCount() : getReviewCount(userId),
  ]);

  return Response.json({ reviews, total, page, limit });
}
