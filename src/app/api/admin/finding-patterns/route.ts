import { requireRole } from "@/lib/auth/helpers";
import {
  listFindingPatterns,
  detectFindingPatterns,
  promoteFindingPatternToTemplate,
  deleteFindingPattern,
} from "@/lib/db";

export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "true";

    const patterns = refresh
      ? await detectFindingPatterns()
      : await listFindingPatterns();

    return Response.json({ patterns });
  } catch (err) {
    console.error("[api] Failed to load finding patterns:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load patterns" },
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

  const { patternId, templateText } = body as {
    patternId?: string;
    templateText?: string;
  };

  if (!patternId || typeof patternId !== "string") {
    return Response.json({ error: "patternId is required" }, { status: 400 });
  }
  if (!templateText || typeof templateText !== "string" || !templateText.trim()) {
    return Response.json(
      { error: "templateText is required" },
      { status: 400 }
    );
  }

  try {
    const pattern = await promoteFindingPatternToTemplate(
      patternId,
      templateText.trim(),
      session.user.id
    );
    if (!pattern) {
      return Response.json({ error: "Pattern not found" }, { status: 404 });
    }
    return Response.json({ pattern });
  } catch (err) {
    console.error("[api] Failed to promote finding pattern:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      {
        error: isPoolError
          ? "Database unavailable"
          : "Failed to promote pattern",
      },
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

  const { patternId } = body as { patternId?: string };
  if (!patternId || typeof patternId !== "string") {
    return Response.json({ error: "patternId is required" }, { status: 400 });
  }

  try {
    const deleted = await deleteFindingPattern(patternId);
    if (!deleted) {
      return Response.json({ error: "Pattern not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("[api] Failed to delete finding pattern:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      {
        error: isPoolError
          ? "Database unavailable"
          : "Failed to delete pattern",
      },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
