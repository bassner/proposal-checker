import { requireRole } from "@/lib/auth/helpers";
import { getFindingImpactMatrix } from "@/lib/db";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const data = await getFindingImpactMatrix();
    return Response.json({ data });
  } catch (err) {
    console.error("[api] Failed to load impact matrix:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load impact matrix" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
