import { requireAuth } from "@/lib/auth/helpers";
import { getReviewTemplates } from "@/lib/db";

export async function GET() {
  try {
    await requireAuth();
  } catch (response) {
    return response as Response;
  }

  try {
    const templates = await getReviewTemplates();
    return Response.json({ templates });
  } catch (err) {
    console.error("[api] Failed to load review templates:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load templates" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
