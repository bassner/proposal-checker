import { requireRole } from "@/lib/auth/helpers";
import { listPromptSnippets, createPromptSnippet } from "@/lib/db";
import { promptSnippetSchema } from "@/lib/validation/admin";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const snippets = await listPromptSnippets();
    return Response.json({ snippets });
  } catch (err) {
    console.error("[api] Failed to load prompt snippets:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load snippets" },
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

  const parsed = promptSnippetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const snippet = await createPromptSnippet({
      ...parsed.data,
      createdBy: session.user.id,
    });
    return Response.json({ snippet }, { status: 201 });
  } catch (err) {
    console.error("[api] Failed to create prompt snippet:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to create snippet" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
