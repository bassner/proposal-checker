import { z } from "zod";
import { FINDING_CATEGORY_VALUES } from "@/types/review";

export const severitySchema = z.enum(["critical", "major", "minor", "suggestion"]);

export const findingCategorySchema = z.enum(
  FINDING_CATEGORY_VALUES as unknown as [string, ...string[]]
).describe(
  "Category of the finding: formatting, structure, citation, methodology, writing, figures, logic, completeness, or other"
);

export const sourceLocationSchema = z.object({
  page: z.number().nullable().describe("Page number from === PAGE N === markers, or null if unknown"),
  section: z.string().nullable().describe("Section name, e.g. 'Abstract', 'Problem', or null if not section-specific"),
  quote: z.string().describe("Verbatim excerpt from the proposal showing the issue, with the specific offending part wrapped in **bold**. Include enough context to be meaningful (full sentence or clause)."),
});

export const findingSchema = z.object({
  severity: severitySchema,
  category: findingCategorySchema,
  title: z.string().describe("One-line summary of the issue"),
  description: z
    .string()
    .describe("Detailed explanation of the issue and how to fix it (2-4 sentences)"),
  locations: z
    .array(sourceLocationSchema)
    .describe("Source locations in the proposal where this issue occurs. Empty array for structural absences."),
  previouslyFlagged: z
    .boolean()
    .optional()
    .describe("Set to true if this issue was also present in the previous version of the document. Only set when reviewing a revised document."),
});

export const checkGroupOutputSchema = z.object({
  findings: z
    .array(findingSchema)
    .describe(
      "List of issues found. Return an empty array if no issues were detected for this check group."
    ),
});

export const mergedFeedbackSchema = z.object({
  overallAssessment: z
    .enum(["good", "acceptable", "needs-work"])
    .describe(
      "'good' = ready to submit, 'acceptable' = minor issues, 'needs-work' = significant issues"
    ),
  summary: z
    .string()
    .describe("2-3 sentence overall assessment of the proposal quality"),
  findings: z
    .array(findingSchema)
    .max(25)
    .describe("Deduplicated, consolidated list of 0-25 actionable feedback items, sorted by severity (critical first). Empty array if no issues found."),
});

export type CheckGroupOutput = z.infer<typeof checkGroupOutputSchema>;
export type MergedFeedbackOutput = z.infer<typeof mergedFeedbackSchema>;
