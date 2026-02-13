/**
 * Preflight PDF analysis — quick structural checks on extracted text
 * to warn users about obvious issues before submitting for a full review.
 */

import type { ReviewMode } from "@/types/review";

export type PreflightSeverity = "warning" | "info";

export interface PreflightWarning {
  id: string;
  severity: PreflightSeverity;
  message: string;
  suggestion: string;
}

/**
 * Approximate page count from text length.
 * A typical academic page has ~2500-3000 characters of extracted text.
 */
const CHARS_PER_PAGE = 2750;

/**
 * Run preflight checks on extracted PDF text. Returns an array of warnings.
 * These are lightweight heuristic checks, not LLM-powered.
 */
export function runPreflightChecks(fullText: string, pageCount: number, mode: ReviewMode = "proposal"): PreflightWarning[] {
  const warnings: PreflightWarning[] = [];
  const lower = fullText.toLowerCase();

  // 1. Very short document
  const estimatedPages = fullText.length / CHARS_PER_PAGE;
  if (pageCount < 3 && estimatedPages < 2.5) {
    warnings.push({
      id: "short-document",
      severity: "warning",
      message: "Document appears very short (fewer than 3 pages of text content)",
      suggestion:
        "Thesis proposals typically require 4-6 pages. Ensure your document is complete before submitting.",
    });
  }

  // 2. No bibliography/references section
  const hasBibliography =
    /\b(references|bibliography|works\s+cited|cited\s+literature)\b/.test(lower);
  const hasCitations = /\[\d+\]|\(\w+(?:\s+et\s+al\.?)?,?\s*\d{4}\)/.test(fullText);
  if (!hasBibliography && !hasCitations) {
    warnings.push({
      id: "no-bibliography",
      severity: "warning",
      message: "No bibliography or references section detected",
      suggestion:
        "Academic proposals require a references section. Add a 'References' or 'Bibliography' heading with proper citations.",
    });
  } else if (!hasBibliography && hasCitations) {
    warnings.push({
      id: "no-bibliography-heading",
      severity: "info",
      message: "Citations found in text but no references section heading detected",
      suggestion:
        "Ensure your document has a clearly labeled 'References' or 'Bibliography' section.",
    });
  }

  // 3. No figures or tables mentioned
  const hasFigures = /\b(figure|fig\.|table|diagram|illustration)\s*\d/i.test(fullText);
  if (!hasFigures) {
    warnings.push({
      id: "no-figures",
      severity: "info",
      message: "No figures or tables detected in the document",
      suggestion:
        "Consider adding diagrams, figures, or tables to illustrate your approach, timeline, or system architecture.",
    });
  }

  // 4. No section headings detected
  // Look for common heading patterns: numbered sections (1. Introduction) or
  // lines that look like headings (short, capitalized, no period at end)
  const hasNumberedHeadings = /\n\s*\d+(\.\d+)*\.?\s+[A-Z]/.test(fullText);
  const hasCommonHeadings =
    /\b(introduction|abstract|conclusion|related\s+work|background|evaluation|discussion|results|schedule|timeline|motivation|problem|objectives?)\b/i.test(
      fullText
    );
  if (!hasNumberedHeadings && !hasCommonHeadings) {
    warnings.push({
      id: "no-headings",
      severity: "warning",
      message: "No section headings detected in the document",
      suggestion:
        "Structure your proposal with clear section headings (e.g., Introduction, Problem, Motivation, Objective, Schedule).",
    });
  }

  // 5. Missing required sections (mode-dependent)
  // Proposal: Introduction, Problem, Motivation, Objective, Schedule
  // Thesis:   Introduction, Problem, Motivation, Conclusion (content chapters are flexible)
  const commonSections: { name: string; patterns: RegExp }[] = [
    {
      name: "Introduction",
      patterns: /\b(introduction|einleitung)\b/i,
    },
    {
      name: "Problem",
      patterns: /\b(problem|problemstellung)\b/i,
    },
    {
      name: "Motivation",
      patterns: /\b(motivation)\b/i,
    },
  ];

  const proposalOnlySections: { name: string; patterns: RegExp }[] = [
    {
      name: "Objective",
      patterns: /\b(objectives?|zielsetzung|goals?)\b/i,
    },
    {
      name: "Schedule",
      patterns: /\b(schedule|timeline|time\s*plan|milestones?|gantt|work\s*plan|project\s*plan|zeitplan)\b/i,
    },
  ];

  const thesisOnlySections: { name: string; patterns: RegExp }[] = [
    {
      name: "Conclusion",
      patterns: /\b(conclusion|fazit|summary\s+and\s+conclusion|concluding\s+remarks)\b/i,
    },
  ];

  const missingSections = [
    ...commonSections,
    ...(mode === "thesis" ? thesisOnlySections : proposalOnlySections),
  ];

  const missing = missingSections.filter((s) => !s.patterns.test(fullText));
  if (missing.length > 0 && hasCommonHeadings) {
    // Only warn about missing sections if we detected some headings
    // (otherwise the "no headings" warning already covers this)
    warnings.push({
      id: "missing-sections",
      severity: "info",
      message: `Potentially missing sections: ${missing.map((s) => s.name).join(", ")}`,
      suggestion:
        "Review the proposal guidelines to ensure all required sections are included.",
    });
  }

  // 6. Unusual document length
  if (mode === "proposal" && pageCount > 15 && estimatedPages > 12) {
    warnings.push({
      id: "long-document",
      severity: "info",
      message: `Document is ${pageCount} pages long, which exceeds the typical proposal length`,
      suggestion:
        "If this is a full thesis rather than a proposal, consider selecting the 'Thesis' review mode instead.",
    });
  } else if (mode === "thesis" && pageCount < 15 && estimatedPages < 12) {
    warnings.push({
      id: "short-thesis",
      severity: "info",
      message: `Document is ${pageCount} pages long, which is short for a thesis`,
      suggestion:
        "If this is a proposal rather than a full thesis, consider selecting the 'Proposal' review mode instead.",
    });
  }

  return warnings;
}
