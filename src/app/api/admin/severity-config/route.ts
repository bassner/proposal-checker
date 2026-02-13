import { requireRole } from "@/lib/auth/helpers";
import { getSeverityWeights, updateSeverityWeight } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const weights = await getSeverityWeights();
    return Response.json({ weights });
  } catch (err) {
    console.error("[api] Failed to load severity weights:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load severity configuration" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

const updateSchema = z.object({
  severity: z.string().min(1),
  weight: z.number().int().min(0).max(100),
});

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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await updateSeverityWeight(parsed.data.severity, parsed.data.weight);
    return Response.json({ success: true, weight: result });
  } catch (err) {
    console.error("[api] Failed to update severity weight:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    const isUnknown =
      err instanceof Error && err.message.includes("Unknown severity");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : isUnknown ? err.message : "Failed to update severity weight" },
      { status: isPoolError ? 503 : isUnknown ? 400 : 500 }
    );
  }
}
