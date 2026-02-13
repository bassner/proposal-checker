import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getApprovalStats } from "@/lib/db";

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
    const data = await getApprovalStats();
    if (!data) {
      return Response.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }
    return Response.json(data);
  } catch (err) {
    console.error("[api] Failed to fetch approval stats:", err);
    return Response.json(
      { error: "Failed to fetch approval stats" },
      { status: 500 }
    );
  }
}
