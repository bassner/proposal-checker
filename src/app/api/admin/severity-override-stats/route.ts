import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getSeverityOverrideStats } from "@/lib/db";

/**
 * GET /api/admin/severity-override-stats — Aggregate severity override statistics.
 * Admin only.
 */
export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    const stats = await getSeverityOverrideStats();
    if (!stats) {
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }
    return Response.json(stats);
  } catch (err) {
    console.error("[api] Failed to fetch severity override stats:", err);
    return Response.json(
      { error: "Failed to fetch severity override stats" },
      { status: 500 }
    );
  }
}
