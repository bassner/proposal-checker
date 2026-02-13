export type Severity = "critical" | "major" | "minor" | "suggestion";

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
}

export interface CheckGroupResult {
  groupId: CheckGroupId;
  findings: Finding[];
  error?: string;
}

export interface MergedFeedback {
  overallAssessment: "good" | "acceptable" | "needs-work";
  summary: string;
  findings: Finding[];
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
