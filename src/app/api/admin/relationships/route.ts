import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getRelationshipGraph, getRelationshipStats } from "@/lib/db";

/**
 * GET /api/admin/relationships — Admin overview of all proposal relationships.
 * Returns stats (counts by type, most-connected) and the full edge list.
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
    const [stats, graph] = await Promise.all([
      getRelationshipStats(),
      getRelationshipGraph(),
    ]);
    return Response.json({ stats, relationships: graph });
  } catch (err) {
    console.error("[api] Failed to fetch relationships:", err);
    return Response.json({ error: "Failed to fetch relationships" }, { status: 500 });
  }
}
