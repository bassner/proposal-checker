export type Severity = "critical" | "major" | "minor" | "suggestion";

export type CheckGroupId =
  | "structure"
  | "problem-motivation-objectives"
  | "bibliography"
  | "figures"
  | "writing-style"
  | "writing-structure"
  | "writing-formatting"
  | "ai-transparency"
  | "schedule";

export interface CheckGroupMeta {
  id: CheckGroupId;
  label: string;
}

export const CHECK_GROUPS: CheckGroupMeta[] = [
  { id: "structure", label: "Structure & Completeness" },
  { id: "problem-motivation-objectives", label: "Problem & Motivation & Objectives" },
  { id: "bibliography", label: "Bibliography & Citations" },
  { id: "figures", label: "Figures & Diagrams" },
  { id: "writing-style", label: "Writing Style" },
  { id: "writing-structure", label: "Paragraph Structure" },
  { id: "writing-formatting", label: "Formatting & Terminology" },
  { id: "ai-transparency", label: "AI Transparency Statement" },
  { id: "schedule", label: "Schedule Quality" },
];

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
export type AnnotationStatus = "accepted" | "dismissed" | "fixed";

export interface AnnotationEntry {
  status: AnnotationStatus;
  updatedAt: string;
}

/** Keys are stringified finding indices from the feedback.findings array. */
export type Annotations = Record<string, AnnotationEntry>;

