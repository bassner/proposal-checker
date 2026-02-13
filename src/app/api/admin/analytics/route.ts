import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getAnalytics } from "@/lib/db";

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
    const data = await getAnalytics();
    if (!data) {
      return Response.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }
    return Response.json(data);
  } catch (err) {
    console.error("[api] Failed to fetch analytics:", err);
    return Response.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
