import { requireRole } from "@/lib/auth/helpers";
import { updateReviewTemplate, deleteReviewTemplate } from "@/lib/db";
import { reviewTemplateSchema } from "@/lib/validation/admin";

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

  const parsed = reviewTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const template = await updateReviewTemplate(id, parsed.data);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }
    return Response.json({ template });
  } catch (err) {
    console.error("[api] Failed to update review template:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to update template" },
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
    const deleted = await deleteReviewTemplate(id);
    if (!deleted) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("[api] Failed to delete review template:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to delete template" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
