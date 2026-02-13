import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getFailedReviews } from "@/lib/db";

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
    const data = await getFailedReviews();
    if (!data) {
      return Response.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }
    return Response.json(data);
  } catch (err) {
    console.error("[api] Failed to fetch failed reviews:", err);
    return Response.json(
      { error: "Failed to fetch failed reviews" },
      { status: 500 }
    );
  }
}
