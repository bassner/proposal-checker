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
  matchedPreviousFindingIndices: z
    .array(z.number().int().nonnegative())
    .optional()
    .describe("Indices of previous findings this finding corresponds to (for version tracking)"),
});

export const resolvedPreviousFindingSchema = z.object({
  previousFindingIndex: z.number().int().nonnegative()
    .describe("Index of the resolved finding in the previous review's findings array"),
  title: z.string().default("").describe("Title of the previous finding (for cross-check)"),
  reasoning: z.string().max(200).default("").describe("1-2 sentence explanation of how this was resolved"),
});

export const checkGroupOutputSchema = z.object({
  findings: z
    .array(findingSchema)
    .describe(
      "List of issues found. Return an empty array if no issues were detected for this check group."
    ),
  resolvedPreviousFindings: z
    .array(resolvedPreviousFindingSchema)
    .optional()
    .describe("Previous findings addressed in this version. Only for revision reviews."),
});

export const versionComparisonSchema = z.object({
  previousReviewId: z.string().uuid().describe("ID of the previous review being compared against"),
  resolvedFindings: z.array(z.object({
    previousFindingIndex: z.number().int().nonnegative(),
    title: z.string().default("(resolved finding)"),
    severity: severitySchema.default("minor"),
    category: findingCategorySchema.default("other"),
    reasoning: z.string().max(200).default(""),
  })),
  persistentFindings: z.array(z.object({
    previousFindingIndex: z.number().int().nonnegative(),
    previousTitle: z.string().default(""),
    currentTitle: z.string().default(""),
    severity: severitySchema.default("minor"),
    category: findingCategorySchema.default("other"),
    conflicted: z.boolean().optional().describe("True if check groups disagreed on resolution status"),
  })),
  unreviewedFindings: z.array(z.object({
    previousFindingIndex: z.number().int().nonnegative(),
    title: z.string().default("(unreviewed finding)"),
    severity: severitySchema.default("minor"),
    category: findingCategorySchema.default("other"),
    reason: z.string().default("Check group did not evaluate this finding"),
  })),
  newFindings: z.array(z.object({
    title: z.string().default("(new finding)"),
    severity: severitySchema.default("minor"),
    category: findingCategorySchema.default("other"),
  })),
  improvementSummary: z.string().default("").describe("1-2 sentence narrative of what improved and what regressed"),
});

export const mergedFindingSchema = findingSchema;

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
  versionComparison: versionComparisonSchema.optional()
    .describe("Version comparison data. Only present when reviewing a revised document."),
});

export type CheckGroupOutput = z.infer<typeof checkGroupOutputSchema>;
export type MergedFeedbackOutput = z.infer<typeof mergedFeedbackSchema>;
