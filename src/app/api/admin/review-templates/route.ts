import { requireRole } from "@/lib/auth/helpers";
import { getReviewTemplates, createReviewTemplate } from "@/lib/db";
import { reviewTemplateSchema } from "@/lib/validation/admin";

export async function GET() {
  try {
    await requireRole("admin");
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

  const parsed = reviewTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const template = await createReviewTemplate({
      ...parsed.data,
      createdBy: session.user.id,
    });
    return Response.json({ template }, { status: 201 });
  } catch (err) {
    console.error("[api] Failed to create review template:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to create template" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
