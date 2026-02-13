import { requireRole } from "@/lib/auth/helpers";
import { getCheckGroupOrder, updateCheckGroupOrder } from "@/lib/db";
import { CHECK_GROUP_IDS } from "@/types/review";
import { z } from "zod";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  try {
    const order = await getCheckGroupOrder();
    return Response.json({ order });
  } catch (err) {
    console.error("[api] Failed to load check group order:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to load check group order" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}

const orderItemSchema = z.object({
  checkGroup: z.enum(CHECK_GROUP_IDS),
  displayOrder: z.number().int().min(0),
});

const updateSchema = z.object({
  order: z.array(orderItemSchema).min(1),
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
    const result = await updateCheckGroupOrder(parsed.data.order);
    return Response.json({ success: true, order: result });
  } catch (err) {
    console.error("[api] Failed to update check group order:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to update check group order" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
