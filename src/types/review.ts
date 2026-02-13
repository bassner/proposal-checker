export type Severity = "critical" | "major" | "minor" | "suggestion";

// ── Finding categories ───────────────────────────────────────────────────
export const FINDING_CATEGORY_VALUES = [
  "formatting",
  "structure",
  "citation",
  "methodology",
  "writing",
  "figures",
  "logic",
  "completeness",
  "other",
] as const;

export type FindingCategory = (typeof FINDING_CATEGORY_VALUES)[number];

export interface FindingCategoryMeta {
  label: string;
  /** Tailwind bg + text classes for the badge pill. */
  bgClass: string;
  textClass: string;
}

/** Display metadata for each finding category. */
export const FINDING_CATEGORIES: Record<FindingCategory, FindingCategoryMeta> = {
  formatting:   { label: "Formatting",   bgClass: "bg-violet-500/15",  textClass: "text-violet-400" },
  structure:    { label: "Structure",    bgClass: "bg-sky-500/15",     textClass: "text-sky-400" },
  citation:     { label: "Citation",     bgClass: "bg-amber-500/15",   textClass: "text-amber-400" },
  methodology:  { label: "Methodology",  bgClass: "bg-teal-500/15",    textClass: "text-teal-400" },
  writing:      { label: "Writing",      bgClass: "bg-pink-500/15",    textClass: "text-pink-400" },
  figures:      { label: "Figures",      bgClass: "bg-emerald-500/15", textClass: "text-emerald-400" },
  logic:        { label: "Logic",        bgClass: "bg-indigo-500/15",  textClass: "text-indigo-400" },
  completeness: { label: "Completeness", bgClass: "bg-cyan-500/15",    textClass: "text-cyan-400" },
  other:        { label: "Other",        bgClass: "bg-slate-500/15",   textClass: "text-slate-400" },
};

/**
 * Normalize a free-form category string (from older reviews or the LLM) into
 * a known FindingCategory. Falls back to "other" if no match is found.
 */
export function normalizeFindingCategory(raw: string | undefined): FindingCategory {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();
  // Direct match
  if (FINDING_CATEGORY_VALUES.includes(lower as FindingCategory)) return lower as FindingCategory;
  // Keyword-based heuristic for free-form strings from older reviews
  if (/format|terminol|title\s*case|heading/i.test(lower)) return "formatting";
  if (/structur|section|length|missing/i.test(lower)) return "structure";
  if (/citat|bibliograph|reference|footnote/i.test(lower)) return "citation";
  if (/method|approach|design/i.test(lower)) return "methodology";
  if (/writ|style|voice|grammar|paragraph|contraction|filler|sentence/i.test(lower)) return "writing";
  if (/figur|diagram|image|caption|uml/i.test(lower)) return "figures";
  if (/logic|argument|reasoning|coherence/i.test(lower)) return "logic";
  if (/complet|missing|absent|lack|schedul|transparen/i.test(lower)) return "completeness";
  return "other";
}

// ── Workflow status ─────────────────────────────────────────────────────
export const WORKFLOW_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "needs_revision",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface WorkflowStatusMeta {
  label: string;
  bgClass: string;
  textClass: string;
}

/** Display metadata for each workflow status. */
export const WORKFLOW_STATUS_META: Record<WorkflowStatus, WorkflowStatusMeta> = {
  draft:          { label: "Draft",          bgClass: "bg-slate-500/15",  textClass: "text-slate-400" },
  submitted:      { label: "Submitted",      bgClass: "bg-blue-500/15",   textClass: "text-blue-400" },
  under_review:   { label: "Under Review",   bgClass: "bg-amber-500/15",  textClass: "text-amber-400" },
  approved:       { label: "Approved",        bgClass: "bg-green-500/15",  textClass: "text-green-400" },
  needs_revision: { label: "Needs Revision", bgClass: "bg-red-500/15",    textClass: "text-red-400" },
};

/**
 * Valid workflow status transitions, keyed by current status.
 * draft -> submitted
 * submitted -> under_review
 * under_review -> approved | needs_revision
 * needs_revision -> submitted
 */
export const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft:          ["submitted"],
  submitted:      ["under_review"],
  under_review:   ["approved", "needs_revision"],
  approved:       [],
  needs_revision: ["submitted"],
};

export const REVIEW_MODES = ["proposal", "thesis"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export type CheckGroupId =
  | "structure"
  | "problem-motivation-objectives"
  | "bibliography"
  | "figures"
  | "writing-style"
  | "writing-structure"
  | "writing-formatting"
  | "ai-transparency"
  | "schedule"
  | "related-work"
  | "methodology"
  | "evaluation";

/** All valid check group IDs as a const tuple (for Zod enum validation). */
export const CHECK_GROUP_IDS = [
  "structure", "problem-motivation-objectives", "bibliography", "figures",
  "writing-style", "writing-structure", "writing-formatting", "ai-transparency",
  "schedule", "related-work", "methodology", "evaluation",
] as const satisfies readonly CheckGroupId[];

export interface CheckGroupMeta {
  id: CheckGroupId;
  label: string;
}

/** Metadata for every known check group (both proposal and thesis). */
export const ALL_CHECK_GROUP_META: Record<CheckGroupId, CheckGroupMeta> = {
  "structure": { id: "structure", label: "Structure & Completeness" },
  "problem-motivation-objectives": { id: "problem-motivation-objectives", label: "Problem & Motivation & Objectives" },
  "bibliography": { id: "bibliography", label: "Bibliography & Citations" },
  "figures": { id: "figures", label: "Figures & Diagrams" },
  "writing-style": { id: "writing-style", label: "Writing Style" },
  "writing-structure": { id: "writing-structure", label: "Paragraph Structure" },
  "writing-formatting": { id: "writing-formatting", label: "Formatting & Terminology" },
  "ai-transparency": { id: "ai-transparency", label: "AI Transparency Statement" },
  "schedule": { id: "schedule", label: "Schedule Quality" },
  "related-work": { id: "related-work", label: "Related Work" },
  "methodology": { id: "methodology", label: "Methodology" },
  "evaluation": { id: "evaluation", label: "Evaluation" },
};

const PROPOSAL_GROUP_IDS: CheckGroupId[] = [
  "structure", "problem-motivation-objectives", "bibliography", "figures",
  "writing-style", "writing-structure", "writing-formatting", "ai-transparency", "schedule",
];

const THESIS_GROUP_IDS: CheckGroupId[] = [
  ...PROPOSAL_GROUP_IDS, "related-work", "methodology", "evaluation",
];

/** Get check groups for a given review mode. */
export function getCheckGroups(mode: ReviewMode): CheckGroupMeta[] {
  const ids = mode === "thesis" ? THESIS_GROUP_IDS : PROPOSAL_GROUP_IDS;
  return ids.map((id) => ALL_CHECK_GROUP_META[id]);
}

/** @deprecated Use getCheckGroups(mode) instead. Kept for backward compatibility. */
export const CHECK_GROUPS: CheckGroupMeta[] = getCheckGroups("proposal");

export interface SourceLocation {
  page: number | null;
  section: string | null;
  quote: string;
}

export interface Finding {
  severity: Severity;
  category: string;
  title: string;
  description: string;
  locations: SourceLocation[];
  /** When true, this finding was manually added by a supervisor (not AI-generated). */
  manual?: boolean;
  /** Display name of the supervisor who added this finding. */
  addedBy?: string;
}

export interface CheckGroupResult {
  groupId: CheckGroupId;
  findings: Finding[];
  error?: string;
}

export interface FailedGroupInfo {
  groupId: CheckGroupId;
  label: string;
  error: string;
}

export interface MergedFeedback {
  overallAssessment: "good" | "acceptable" | "needs-work";
  summary: string;
  findings: Finding[];
  /** Check groups that failed during the review. Present only when partial results are returned. */
  failedGroups?: FailedGroupInfo[];
}

export type LLMPhase = "thinking" | "generating";

// SSE event types
export type SSEEventType =
  | "step"
  | "check-start"
  | "check-complete"
  | "check-failed"
  | "check-tokens"
  | "check-thinking"
  | "merge-tokens"
  | "merge-thinking"
  | "result"
  | "done"
  | "error";

export interface StepEvent {
  step: "upload" | "extract" | "check" | "merge";
  status: "pending" | "active" | "done" | "error";
}

// Client-side state
export type StepStatus = "pending" | "active" | "done" | "error";

export interface CheckGroupState {
  id: CheckGroupId;
  label: string;
  status: StepStatus;
  findingCount?: number;
  tokenCount?: number;
  reasoningTokens?: number;
  phase?: LLMPhase;
  thinkingSummary?: string;
  error?: string;
  startTime?: number;
  generatingStartTime?: number;
  generatingStartTokenCount?: number;
  endTime?: number;
}

export interface ReviewState {
  status: "idle" | "running" | "done" | "error";
  mode: ReviewMode | null;
  provider: ProviderType | null;
  currentStep: StepEvent["step"] | null;
  steps: Record<StepEvent["step"], StepStatus>;
  checkGroups: CheckGroupState[];
  mergeTokens: number;
  mergeReasoningTokens: number;
  mergePhase: LLMPhase | null;
  mergeThinkingSummary?: string;
  mergeStartTime: number | null;
  mergeGeneratingStartTime: number | null;
  mergeGeneratingStartTokenCount: number;
  mergeEndTime: number | null;
  totalInputTokens: number;
  result: MergedFeedback | null;
  error: string | null;
  startTime: number | null;
}

export const PROVIDER_TYPES = ["azure", "ollama"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface ModelConfig {
  provider: ProviderType;
  label: string;
  model: string;
}

// Finding annotations (user feedback on individual findings)
export type AnnotationStatus = "dismissed" | "fixed";

export type ThreadStatus = "open" | "resolved";

export interface Comment {
  id: string;
  text: string;
  authorName: string;
  /** Internal only — stripped before sending to clients. */
  authorId: string;
  createdAt: string;
  /** If set, this comment is a reply to the comment with this ID. */
  parentId?: string;
  /** Thread status — only meaningful on top-level comments (no parentId). */
  threadStatus?: ThreadStatus;
  /** User ID who resolved the thread. Internal only — stripped before sending. */
  resolvedBy?: string;
  /** Display name of user who resolved the thread. */
  resolvedByName?: string;
  /** Timestamp when the thread was resolved. */
  resolvedAt?: string;
  /** Nested replies — populated in API responses, not stored flat in DB. */
  replies?: Comment[];
}

export interface AnnotationEntry {
  status?: AnnotationStatus;
  updatedAt: string;
  comments?: Comment[];
}

/** Keys are stringified finding indices from the feedback.findings array. */
export type Annotations = Record<string, AnnotationEntry>;

/** Conflict detected when different users set different statuses on the same finding. */
export interface AnnotationConflict {
  findingIndex: number;
  entries: {
    userId: string;
    userName: string | null;
    status: string;
    createdAt: string;
  }[];
}
