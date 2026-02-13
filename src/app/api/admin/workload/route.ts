import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getReviewerWorkload } from "@/lib/db";

/** GET /api/admin/workload -- Reviewer workload stats (admin only). */
export async function GET() {
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

  try {
    const data = await getReviewerWorkload();
    if (!data) {
      return Response.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }
    return Response.json(data);
  } catch (err) {
    console.error("[api] Failed to fetch workload stats:", err);
    return Response.json(
      { error: "Failed to fetch workload stats" },
      { status: 500 }
    );
  }
}
