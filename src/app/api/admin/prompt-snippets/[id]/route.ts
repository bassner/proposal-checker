import { requireRole } from "@/lib/auth/helpers";
import { updatePromptSnippet, deletePromptSnippet } from "@/lib/db";
import { promptSnippetSchema } from "@/lib/validation/admin";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = promptSnippetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const snippet = await updatePromptSnippet(id, parsed.data);
    if (!snippet) {
      return Response.json({ error: "Snippet not found" }, { status: 404 });
    }
    return Response.json({ snippet });
  } catch (err) {
    console.error("[api] Failed to update prompt snippet:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to update snippet" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const { id } = await params;

  try {
    const deleted = await deletePromptSnippet(id);
    if (!deleted) {
      return Response.json({ error: "Snippet not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("[api] Failed to delete prompt snippet:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to delete snippet" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
