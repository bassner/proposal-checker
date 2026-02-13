import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { PROVIDER_TYPES, REVIEW_MODES, CHECK_GROUP_IDS } from "@/types/review";

export const roleProviderPatchSchema = z.object({
  role: z.enum(APP_ROLES as [AppRole, ...AppRole[]]),
  providers: z.array(z.enum(PROVIDER_TYPES))
    .min(1, "At least one provider required")
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Duplicate providers not allowed"
    })
});

export type RoleProviderPatch = z.infer<typeof roleProviderPatchSchema>;

export const reviewTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).default(""),
  checkGroups: z.array(z.enum(CHECK_GROUP_IDS))
    .min(1, "At least one check group required")
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Duplicate check groups not allowed"
    }),
  reviewMode: z.enum(REVIEW_MODES),
});

export type ReviewTemplateInput = z.infer<typeof reviewTemplateSchema>;
