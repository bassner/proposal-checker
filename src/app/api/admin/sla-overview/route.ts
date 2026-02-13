import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getOverdueSLAs, getSLAAnalytics } from "@/lib/db";

/**
 * GET /api/admin/sla-overview — Return overdue SLAs + analytics (admin only).
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
    const [overdue, analytics] = await Promise.all([
      getOverdueSLAs(),
      getSLAAnalytics(),
    ]);

    return Response.json({ overdue, analytics });
  } catch (err) {
    console.error("[api] Failed to fetch SLA overview:", err);
    return Response.json(
      { error: "Failed to fetch SLA overview" },
      { status: 500 }
    );
  }
}
