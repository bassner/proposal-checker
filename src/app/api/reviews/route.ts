import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, queryReviews, getReviewCount, queryReviewsGrouped, getPinnedReviewIds, getTagsForReviews } from "@/lib/db";

const MAX_PAGE = 1000;
const ALLOWED_SORT = new Set(["created_at", "file_name", "provider", "status", "user_name", "workflow_status"]);
const MAX_SEARCH_LEN = 200;

/**
 * GET /api/reviews?page=1&limit=20&sort=created_at&dir=desc&search=proposal
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

  if (page > MAX_PAGE) {
    return Response.json(
      { error: `Page number too large (max: ${MAX_PAGE})` },
      { status: 400 }
    );
  }

  const offset = (page - 1) * limit;

  // Sort params
  const sortParam = url.searchParams.get("sort") ?? "created_at";
  const sortBy = ALLOWED_SORT.has(sortParam) ? sortParam : "created_at";
  const dirParam = url.searchParams.get("dir");
  const sortDir: "asc" | "desc" = dirParam === "asc" ? "asc" : "desc";

  // Search param
  const rawSearch = url.searchParams.get("search")?.trim() ?? "";
  const search = rawSearch.slice(0, MAX_SEARCH_LEN) || undefined;

  const isAdmin = session.user.role === "admin";
  const mineOnly = url.searchParams.get("mine") === "true";
  const userId = (isAdmin && !mineOnly) ? undefined : session.user.id;

  // Grouped mode: lightweight query for "Group by file" view
  if (url.searchParams.get("grouped") === "true") {
    const result = await queryReviewsGrouped({ userId, search });
    return Response.json({ ...result, grouped: true as const });
  }

  const [reviews, total, pinnedIds] = await Promise.all([
    queryReviews({ userId, limit, offset, sortBy, sortDir, search }),
    getReviewCount(userId, search),
    getPinnedReviewIds(session.user.id),
  ]);

  // Batch-fetch tags for all reviews on this page
  const reviewIds = reviews.map((r) => r.id);
  const tagsMap = await getTagsForReviews(reviewIds);

  // Strip sensitive/heavy fields from list responses, add isPinned + tags
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sanitized = reviews.map(({ shareToken, sharePasswordHash, annotations, ...rest }) => ({
    ...rest,
    isPinned: pinnedIds.has(rest.id),
    tags: (tagsMap.get(rest.id) ?? []).map((t) => t.tag),
  }));

  return Response.json({ reviews: sanitized, total, page, limit });
}
