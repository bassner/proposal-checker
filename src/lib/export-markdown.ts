import type { MergedFeedback, Severity, Finding } from "@/types/review";

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  suggestion: "Suggestions",
};

const ASSESSMENT_LABELS: Record<MergedFeedback["overallAssessment"], string> = {
  good: "Ready to Submit",
  acceptable: "Needs Minor Revisions",
  "needs-work": "Significant Issues",
};

function groupBySeverity(findings: Finding[]): Partial<Record<Severity, Finding[]>> {
  const groups: Partial<Record<Severity, Finding[]>> = {};
  for (const f of findings) {
    if (!groups[f.severity]) groups[f.severity] = [];
    groups[f.severity]!.push(f);
  }
  return groups;
}

export function feedbackToMarkdown(feedback: MergedFeedback, fileName?: string | null): string {
  const lines: string[] = [];

  lines.push("# Proposal Review Results");
  if (fileName) lines.push(`**File:** ${fileName}`);
  lines.push(`**Date:** ${new Date().toLocaleDateString()}`);
  lines.push("");

  lines.push(`## Overall Assessment: ${ASSESSMENT_LABELS[feedback.overallAssessment]}`);
  lines.push("");
  lines.push(feedback.summary);
  lines.push("");

  const grouped = groupBySeverity(feedback.findings);
  const counts = SEVERITY_ORDER
    .map((s) => ({ s, count: grouped[s]?.length ?? 0 }))
    .filter(({ count }) => count > 0);

  if (counts.length > 0) {
    lines.push(counts.map(({ s, count }) => `**${count}** ${SEVERITY_LABELS[s].toLowerCase()}`).join(" | "));
    lines.push("");
  }

  if (feedback.findings.length === 0) {
    lines.push("No issues found. The proposal meets all checked criteria.");
    return lines.join("\n");
  }

  for (const severity of SEVERITY_ORDER) {
    const findings = grouped[severity];
    if (!findings || findings.length === 0) continue;

    lines.push(`## ${SEVERITY_LABELS[severity]} (${findings.length})`);
    lines.push("");

    for (const finding of findings) {
      lines.push(`### ${finding.title}`);
      lines.push("");
      lines.push(finding.description);

      if (finding.locations.length > 0) {
        lines.push("");
        for (const loc of finding.locations) {
          const ref = [loc.page != null ? `p. ${loc.page}` : null, loc.section]
            .filter(Boolean)
            .join(" - ");
          const prefix = ref || "Source";
          lines.push(`> **${prefix}:** "${loc.quote}"`);
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
