import { requireRole } from "@/lib/auth/helpers";
import {
  listWebhooks,
  insertWebhook,
  updateWebhook,
  deleteWebhook,
  WEBHOOK_EVENTS,
} from "@/lib/db";
import type { WebhookEvent } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^https?:\/\/.+/;

function validateEvents(events: unknown): events is WebhookEvent[] {
  if (!Array.isArray(events) || events.length === 0) return false;
  const validSet = new Set<string>(WEBHOOK_EVENTS);
  return events.every((e) => typeof e === "string" && validSet.has(e));
}

/** GET /api/admin/webhooks — List all webhooks (admin only). */
export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const webhooks = await listWebhooks();
    return Response.json({ webhooks });
  } catch (err) {
    console.error("[api] Failed to list webhooks:", err);
    return Response.json({ error: "Failed to list webhooks" }, { status: 500 });
  }
}

/** POST /api/admin/webhooks — Create a new webhook (admin only). */
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

  const { url, events, secret } = body as Record<string, unknown>;

  if (typeof url !== "string" || !URL_RE.test(url)) {
    return Response.json({ error: "Invalid URL (must be http/https)" }, { status: 400 });
  }
  if (!validateEvents(events)) {
    return Response.json(
      { error: `events must be a non-empty array of: ${WEBHOOK_EVENTS.join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof secret !== "string" || secret.length < 8) {
    return Response.json(
      { error: "secret must be a string of at least 8 characters" },
      { status: 400 }
    );
  }

  try {
    const webhook = await insertWebhook({
      url,
      events,
      secret,
      createdBy: session.user.id,
    });
    return Response.json({ webhook }, { status: 201 });
  } catch (err) {
    console.error("[api] Failed to create webhook:", err);
    const isPoolError = err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to create webhook" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

/** PUT /api/admin/webhooks — Update an existing webhook (admin only). */
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

  const { id, url, events, secret, active } = body as Record<string, unknown>;

  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (url !== undefined) {
    if (typeof url !== "string" || !URL_RE.test(url)) {
      return Response.json({ error: "Invalid URL" }, { status: 400 });
    }
    updates.url = url;
  }
  if (events !== undefined) {
    if (!validateEvents(events)) {
      return Response.json(
        { error: `events must be a non-empty array of: ${WEBHOOK_EVENTS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.events = events;
  }
  if (secret !== undefined) {
    if (typeof secret !== "string" || secret.length < 8) {
      return Response.json(
        { error: "secret must be at least 8 characters" },
        { status: 400 }
      );
    }
    updates.secret = secret;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return Response.json({ error: "active must be a boolean" }, { status: 400 });
    }
    updates.active = active;
  }

  try {
    const webhook = await updateWebhook(id, updates);
    if (!webhook) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }
    return Response.json({ webhook });
  } catch (err) {
    console.error("[api] Failed to update webhook:", err);
    return Response.json({ error: "Failed to update webhook" }, { status: 500 });
  }
}

/** DELETE /api/admin/webhooks — Delete a webhook (admin only). */
export async function DELETE(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  try {
    const deleted = await deleteWebhook(id);
    if (!deleted) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api] Failed to delete webhook:", err);
    return Response.json({ error: "Failed to delete webhook" }, { status: 500 });
  }
}
