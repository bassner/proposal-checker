import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getTokenUsageSummary, getTokenUsageForReview } from "@/lib/db";

/**
 * GET /api/admin/token-usage — Aggregated token usage stats (admin only).
 * Query params:
 *   - days: number of days to look back (default 30)
 *   - reviewId: optional, get per-review breakdown instead of summary
 */
export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json(
      { error: "Database unavailable" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const reviewId = searchParams.get("reviewId");

  try {
    if (reviewId) {
      const data = await getTokenUsageForReview(reviewId);
      return Response.json({ usage: data });
    }

    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
    const data = await getTokenUsageSummary(safeDays);

    if (!data) {
      return Response.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }

    return Response.json(data);
  } catch (err) {
    console.error("[api] Failed to fetch token usage:", err);
    return Response.json(
      { error: "Failed to fetch token usage" },
      { status: 500 }
    );
  }
}
