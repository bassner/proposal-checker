import { requireRole } from "@/lib/auth/helpers";
import { updateRoleProviders } from "@/lib/db";
import { invalidateProviderCache } from "@/lib/auth/provider-access";
import { roleProviderPatchSchema } from "@/lib/validation/admin";
import type { RoleProviderPatch } from "@/lib/validation/admin";

export async function PATCH(request: Request) {
  // 1. Auth check (admin only)
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  // 2. Parse + validate request body with Zod
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = roleProviderPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { role, providers }: RoleProviderPatch = parsed.data;

  // 3. Update DB + invalidate cache (throws on DB unavailable)
  try {
    const result = await updateRoleProviders(role, providers);
    invalidateProviderCache();
    return Response.json({ success: true, config: result });
  } catch (err) {
    console.error("[api] Failed to update role config:", err);
    const isPoolError =
      err instanceof Error && err.message.includes("not initialized");
    return Response.json(
      { error: isPoolError ? "Database unavailable" : "Failed to update configuration" },
      { status: isPoolError ? 503 : 500 }
    );
  }
}
