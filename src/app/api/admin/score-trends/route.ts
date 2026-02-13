import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getStudentScoreTrends, getScoreTrendsSummary } from "@/lib/db";
import { NextRequest } from "next/server";

/** GET /api/admin/score-trends -- Student score trend data (admin only).
 *  Without ?userId: returns all students with trends + aggregate summary.
 *  With ?userId=xxx: returns score trend data for that single student.
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
      const students = await getStudentScoreTrends(userId);
      if (students.length === 0) {
        return Response.json(
          { error: "No completed reviews found for this user" },
          { status: 404 }
        );
      }
      return Response.json(students[0]);
    }

    const [students, summary] = await Promise.all([
      getStudentScoreTrends(),
      getScoreTrendsSummary(),
    ]);
    return Response.json({ students, summary });
  } catch (err) {
    console.error("[api] Failed to fetch score trends:", err);
    return Response.json(
      { error: "Failed to fetch score trend data" },
      { status: 500 }
    );
  }
}
