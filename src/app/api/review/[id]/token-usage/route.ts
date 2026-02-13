import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, getTokenUsageForReview } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/review/[id]/token-usage — Token usage breakdown for a specific review.
 * Auth required. Owner or admin can access.
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

  // Access check: owner or admin
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  try {
    const usage = await getTokenUsageForReview(id);

    // Compute totals
    const totals = usage.reduce(
      (acc, row) => ({
        inputTokens: acc.inputTokens + row.inputTokens,
        outputTokens: acc.outputTokens + row.outputTokens,
        reasoningTokens: acc.reasoningTokens + row.reasoningTokens,
        estimatedCostUsd: acc.estimatedCostUsd + row.estimatedCostUsd,
      }),
      { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0 }
    );

    return Response.json({ usage, totals });
  } catch (err) {
    console.error("[api] Failed to fetch token usage for review:", err);
    return Response.json(
      { error: "Failed to fetch token usage" },
      { status: 500 }
    );
  }
}
