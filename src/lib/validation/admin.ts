import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { PROVIDER_TYPES } from "@/types/review";

export const roleProviderPatchSchema = z.object({
  role: z.enum(APP_ROLES as [AppRole, ...AppRole[]]),
  providers: z.array(z.enum(PROVIDER_TYPES))
    .min(1, "At least one provider required")
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Duplicate providers not allowed"
    })
});

export type RoleProviderPatch = z.infer<typeof roleProviderPatchSchema>;
