import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getAllStudentSummaries, getStudentQualityTrends } from "@/lib/db";
import { NextRequest } from "next/server";

/** GET /api/admin/student-trends -- Student quality trend data (admin only).
 *  Without ?userId: returns all student summaries.
 *  With ?userId=xxx: returns detailed trend data for that student.
 */
export async function GET(request: NextRequest) {
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

  const userId = request.nextUrl.searchParams.get("userId");

  try {
    if (userId) {
      const data = await getStudentQualityTrends(userId);
      if (!data) {
        return Response.json(
          { error: "No completed reviews found for this user" },
          { status: 404 }
        );
      }
      return Response.json(data);
    }

    const summaries = await getAllStudentSummaries();
    return Response.json({ students: summaries });
  } catch (err) {
    console.error("[api] Failed to fetch student trends:", err);
    return Response.json(
      { error: "Failed to fetch student trend data" },
      { status: 500 }
    );
  }
}
