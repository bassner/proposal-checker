import { requireRole } from "@/lib/auth/helpers";
import {
  listDeadlines,
  createDeadline,
  deleteDeadline,
  getDeadlineAnalytics,
} from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/deadlines — List all deadlines with analytics (admin only). */
export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const analytics = await getDeadlineAnalytics();
    if (!analytics) {
      // DB unavailable — return empty state
      const deadlines = await listDeadlines();
      return Response.json({ deadlines, analytics: null });
    }
    return Response.json(analytics);
  } catch (err) {
    console.error("[api] Failed to load deadlines:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load deadlines" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

/** POST /api/admin/deadlines — Create a new deadline (admin only). */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, deadline, description } = body as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof deadline !== "string" || isNaN(Date.parse(deadline))) {
    return Response.json({ error: "deadline must be a valid date string" }, { status: 400 });
  }
  if (description !== undefined && typeof description !== "string") {
    return Response.json({ error: "description must be a string" }, { status: 400 });
  }

  try {
    const row = await createDeadline({
      title: title.trim(),
      deadline,
      description: typeof description === "string" ? description.trim() : undefined,
      createdBy: session.user.id,
    });
    return Response.json({ deadline: row }, { status: 201 });
  } catch (err) {
    console.error("[api] Failed to create deadline:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to create deadline" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

/** DELETE /api/admin/deadlines — Delete a deadline (admin only). */
export async function DELETE(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid deadline ID" }, { status: 400 });
  }

  try {
    const deleted = await deleteDeadline(id);
    if (!deleted) {
      return Response.json({ error: "Deadline not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api] Failed to delete deadline:", err);
    return Response.json({ error: "Failed to delete deadline" }, { status: 500 });
  }
}
