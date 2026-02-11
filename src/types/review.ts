export type Severity = "critical" | "major" | "minor" | "suggestion";

export type CheckGroupId =
  | "structure"
  | "problem-motivation-objectives"
  | "bibliography"
  | "figures"
  | "writing"
  | "ai-transparency"
  | "schedule";

export interface CheckGroupMeta {
  id: CheckGroupId;
  label: string;
}

export const CHECK_GROUPS: CheckGroupMeta[] = [
  { id: "structure", label: "Structure & Completeness" },
  { id: "problem-motivation-objectives", label: "Problem / Motivation / Objectives" },
  { id: "bibliography", label: "Bibliography & Citations" },
  { id: "figures", label: "Figures & Diagrams" },
  { id: "writing", label: "Scientific Writing Quality" },
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
  step: "upload" | "extract" | "check" | "merge" | "results";
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

export type ProviderType = "azure" | "ollama";

export interface ModelConfig {
  provider: ProviderType;
  label: string;
  model: string;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    provider: "azure",
    label: "Azure OpenAI (GPT-5.2)",
    model: "gpt-5.2",
  },
  {
    provider: "ollama",
    label: "Ollama (GPT-OSS 120B)",
    model: "gpt-oss:120b",
  },
];
