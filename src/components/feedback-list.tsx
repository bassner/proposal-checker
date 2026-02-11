"use client";

import type { MergedFeedback, Severity, Finding } from "@/types/review";
import { FeedbackCard } from "./feedback-card";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface FeedbackListProps {
  feedback: MergedFeedback;
}

const assessmentConfig = {
  good: {
    icon: CheckCircle2,
    label: "Ready to Submit",
    gradient: "from-emerald-500/20 to-emerald-600/5",
    border: "border-emerald-500/30",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-300",
  },
  acceptable: {
    icon: AlertTriangle,
    label: "Needs Minor Revisions",
    gradient: "from-amber-500/20 to-amber-600/5",
    border: "border-amber-500/30",
    iconColor: "text-amber-400",
    textColor: "text-amber-300",
  },
  "needs-work": {
    icon: XCircle,
    label: "Significant Issues",
    gradient: "from-red-500/20 to-red-600/5",
    border: "border-red-500/30",
    iconColor: "text-red-400",
    textColor: "text-red-300",
  },
};

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

const severityColumnConfig: Record<
  Severity,
  { label: string; headerBg: string; headerText: string; countColor: string }
> = {
  critical: {
    label: "Critical",
    headerBg: "bg-red-500/15",
    headerText: "text-red-300",
    countColor: "text-red-400",
  },
  major: {
    label: "Major",
    headerBg: "bg-orange-500/15",
    headerText: "text-orange-300",
    countColor: "text-orange-400",
  },
  minor: {
    label: "Minor",
    headerBg: "bg-yellow-500/15",
    headerText: "text-yellow-300",
    countColor: "text-yellow-400",
  },
  suggestion: {
    label: "Suggestions",
    headerBg: "bg-blue-500/15",
    headerText: "text-blue-300",
    countColor: "text-blue-400",
  },
};

function minPage(f: Finding): number {
  const pages = f.locations.map((l) => l.page).filter((p): p is number => p != null);
  return pages.length > 0 ? Math.min(...pages) : Infinity;
}

function groupBySeverity(findings: Finding[]): Partial<Record<Severity, Finding[]>> {
  const groups: Partial<Record<Severity, Finding[]>> = {};
  for (const f of findings) {
    if (!groups[f.severity]) groups[f.severity] = [];
    groups[f.severity]!.push(f);
  }
  for (const arr of Object.values(groups)) {
    arr?.sort((a, b) => minPage(a) - minPage(b));
  }
  return groups;
}

export function FeedbackList({ feedback }: FeedbackListProps) {
  const config = assessmentConfig[feedback.overallAssessment];
  const Icon = config.icon;
  const grouped = groupBySeverity(feedback.findings);
  const presentSeverities = SEVERITY_ORDER.filter((s) => grouped[s] && grouped[s]!.length > 0);

  return (
    <div className="space-y-6">
      {/* Overall assessment banner */}
      <div
        className={cn(
          "rounded-xl border bg-gradient-to-r p-4 backdrop-blur-sm",
          config.gradient,
          config.border
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className={cn("h-6 w-6 shrink-0", config.iconColor)} />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <p className={cn("text-sm font-semibold", config.textColor)}>
                {config.label}
              </p>
              <div className="flex gap-3 text-xs text-white/40">
                {SEVERITY_ORDER.map((s) => {
                  const count = grouped[s]?.length || 0;
                  if (count === 0) return null;
                  const col = severityColumnConfig[s];
                  return (
                    <span key={s} className={col.countColor}>
                      {count} {col.label.toLowerCase()}
                    </span>
                  );
                })}
              </div>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              {feedback.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Severity columns */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${presentSeverities.length}, minmax(0, 1fr))`,
        }}
      >
        {presentSeverities.map((severity) => {
          const findings = grouped[severity]!;
          const col = severityColumnConfig[severity];
          return (
            <div key={severity} className="min-w-0">
              {/* Column header */}
              <div
                className={cn(
                  "mb-3 flex items-center justify-between rounded-lg px-3 py-2",
                  col.headerBg
                )}
              >
                <span className={cn("text-xs font-semibold uppercase tracking-wider", col.headerText)}>
                  {col.label}
                </span>
                <span className={cn("text-xs font-bold", col.countColor)}>
                  {findings.length}
                </span>
              </div>
              {/* Cards */}
              <div className="space-y-2">
                {findings.map((finding, i) => (
                  <FeedbackCard key={i} finding={finding} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
