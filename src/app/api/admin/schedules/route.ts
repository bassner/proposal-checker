import { requireRole } from "@/lib/auth/helpers";
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  computeNextRun,
} from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CRON_RE = /^(daily|weekly:[1-7]|monthly:([1-9]|1\d|2[0-8]))$/;
const VALID_PROVIDERS = new Set(["azure", "ollama"]);

/** GET /api/admin/schedules — List all schedules (admin only). */
export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const schedules = await listSchedules();
    return Response.json({ schedules });
  } catch (err) {
    console.error("[api] Failed to load schedules:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load schedules" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

/** POST /api/admin/schedules — Create a new schedule (admin only). */
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

  const { title, description, cronExpression, targetUsers, provider } =
    body as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  if (description !== undefined && typeof description !== "string") {
    return Response.json({ error: "description must be a string" }, { status: 400 });
  }
  if (typeof cronExpression !== "string" || !VALID_CRON_RE.test(cronExpression)) {
    return Response.json(
      { error: "cronExpression must be one of: daily, weekly:1-7, monthly:1-28" },
      { status: 400 }
    );
  }
  if (computeNextRun(cronExpression) === null) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }
  if (targetUsers !== undefined) {
    if (!Array.isArray(targetUsers) || !targetUsers.every((u) => typeof u === "string")) {
      return Response.json({ error: "targetUsers must be an array of strings" }, { status: 400 });
    }
  }
  if (provider !== undefined) {
    if (typeof provider !== "string" || !VALID_PROVIDERS.has(provider)) {
      return Response.json({ error: "provider must be 'azure' or 'ollama'" }, { status: 400 });
    }
  }

  try {
    const schedule = await createSchedule({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      cronExpression,
      targetUsers: targetUsers as string[] | undefined,
      provider: provider as string | undefined,
      createdBy: session.user.id,
    });
    return Response.json({ schedule }, { status: 201 });
  } catch (err) {
    console.error("[api] Failed to create schedule:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to create schedule" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

/** PUT /api/admin/schedules — Update a schedule (admin only). */
export async function PUT(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, title, description, cronExpression, targetUsers, provider, isActive } =
    body as Record<string, unknown>;

  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid schedule ID" }, { status: 400 });
  }

  // Validate optional fields
  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
    return Response.json({ error: "title must be a non-empty string" }, { status: 400 });
  }
  if (description !== undefined && typeof description !== "string") {
    return Response.json({ error: "description must be a string" }, { status: 400 });
  }
  if (cronExpression !== undefined) {
    if (typeof cronExpression !== "string" || !VALID_CRON_RE.test(cronExpression)) {
      return Response.json(
        { error: "cronExpression must be one of: daily, weekly:1-7, monthly:1-28" },
        { status: 400 }
      );
    }
  }
  if (targetUsers !== undefined) {
    if (!Array.isArray(targetUsers) || !targetUsers.every((u) => typeof u === "string")) {
      return Response.json({ error: "targetUsers must be an array of strings" }, { status: 400 });
    }
  }
  if (provider !== undefined) {
    if (typeof provider !== "string" || !VALID_PROVIDERS.has(provider)) {
      return Response.json({ error: "provider must be 'azure' or 'ollama'" }, { status: 400 });
    }
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return Response.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  try {
    const schedule = await updateSchedule(id, {
      title: typeof title === "string" ? title.trim() : undefined,
      description: typeof description === "string" ? description.trim() : undefined,
      cronExpression: cronExpression as string | undefined,
      targetUsers: targetUsers as string[] | undefined,
      provider: provider as string | undefined,
      isActive: isActive as boolean | undefined,
    });
    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    return Response.json({ schedule });
  } catch (err) {
    console.error("[api] Failed to update schedule:", err);
    return Response.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}

/** DELETE /api/admin/schedules — Delete a schedule by ?id=xxx (admin only). */
export async function DELETE(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid schedule ID" }, { status: 400 });
  }

  try {
    const deleted = await deleteSchedule(id);
    if (!deleted) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api] Failed to delete schedule:", err);
    return Response.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
