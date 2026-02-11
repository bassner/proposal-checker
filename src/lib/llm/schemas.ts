import { z } from "zod";

export const severitySchema = z.enum(["critical", "major", "minor", "suggestion"]);

export const sourceLocationSchema = z.object({
  page: z.number().nullable().describe("Page number from === PAGE N === markers, or null if unknown"),
  section: z.string().nullable().describe("Section name, e.g. 'Abstract', 'Problem', or null if not section-specific"),
  quote: z.string().describe("Verbatim excerpt from the proposal showing the issue, with the specific offending part wrapped in **bold**. Include enough context to be meaningful (full sentence or clause)."),
});

export const findingSchema = z.object({
  severity: severitySchema,
  category: z.string().describe("Short category label, e.g. 'Structure', 'Writing Style'"),
  title: z.string().describe("One-line summary of the issue"),
  description: z
    .string()
    .describe("Detailed explanation of the issue and how to fix it (2-4 sentences)"),
  locations: z
    .array(sourceLocationSchema)
    .describe("Source locations in the proposal where this issue occurs. Empty array for structural absences."),
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
    .min(10)
    .max(25)
    .describe("Deduplicated, consolidated list of 10-25 actionable feedback items, sorted by severity (critical first)"),
});

export type CheckGroupOutput = z.infer<typeof checkGroupOutputSchema>;
export type MergedFeedbackOutput = z.infer<typeof mergedFeedbackSchema>;
