import { requireRole } from "@/lib/auth/helpers";
import { getAllCustomPrompts, upsertCustomPrompt, deleteCustomPrompt, toggleCustomPromptActive } from "@/lib/db";
import { customPromptUpsertSchema, customPromptDeleteSchema, customPromptToggleSchema } from "@/lib/validation/admin";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const prompts = await getAllCustomPrompts();
    return Response.json({ prompts });
  } catch (err) {
    console.error("[api] Failed to load custom prompts:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load custom prompts" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

export async function PUT(request: Request) {
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

  const parsed = customPromptUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const prompt = await upsertCustomPrompt(
      parsed.data.checkGroup,
      parsed.data.systemPrompt,
      session.user.id
    );
    return Response.json({ prompt });
  } catch (err) {
    console.error("[api] Failed to upsert custom prompt:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to save custom prompt" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

export async function DELETE(request: Request) {
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

  const parsed = customPromptDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const deleted = await deleteCustomPrompt(parsed.data.checkGroup);
    if (!deleted) {
      return Response.json({ error: "Custom prompt not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("[api] Failed to delete custom prompt:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to delete custom prompt" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

export async function PATCH(request: Request) {
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

  const parsed = customPromptToggleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const prompt = await toggleCustomPromptActive(
      parsed.data.checkGroup,
      parsed.data.isActive
    );
    if (!prompt) {
      return Response.json({ error: "Custom prompt not found" }, { status: 404 });
    }
    return Response.json({ prompt });
  } catch (err) {
    console.error("[api] Failed to toggle custom prompt:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to toggle custom prompt" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
