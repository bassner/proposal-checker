import { requireAuth } from "@/lib/auth/helpers";
import { getSeverityWeights } from "@/lib/db";

/**
 * Public (authenticated) endpoint to fetch severity weights.
 * Used by the QualityScore component on review pages.
 */
export async function GET() {
  try {
    await requireAuth();
  } catch (response) {
    return response as Response;
  }

  try {
    const weights = await getSeverityWeights();
    return Response.json({ weights });
  } catch (err) {
    console.error("[api] Failed to load severity weights:", err);
    return Response.json(
      { error: "Failed to load severity weights" },
      { status: 500 }
    );
  }
}
