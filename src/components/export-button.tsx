"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer, ClipboardCopy, Check, Download } from "lucide-react";
import type { MergedFeedback, Annotations, ReviewMode } from "@/types/review";
import { feedbackToMarkdown } from "@/lib/export-markdown";

export function PrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      onClick={() => window.print()}
    >
      <Printer className="mr-1.5 h-3.5 w-3.5" />
      Print / PDF
    </Button>
  );
}

export function CopyMarkdownButton({ feedback, fileName }: { feedback: MergedFeedback; fileName?: string | null }) {
  const [copied, setCopied] = useState(false);

  const copyMarkdown = useCallback(async () => {
    const md = feedbackToMarkdown(feedback, fileName);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }, [feedback, fileName]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      onClick={copyMarkdown}
    >
      {copied ? (
        <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
      )}
      {copied ? "Copied!" : "Copy Markdown"}
    </Button>
  );
}

// ── Download helpers ─────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function baseFilename(fileName?: string | null): string {
  if (!fileName) return "review";
  return fileName.replace(/\.pdf$/i, "");
}

interface ExportProps {
  feedback: MergedFeedback;
  annotations?: Annotations;
  fileName?: string | null;
  reviewMode?: ReviewMode;
}

// ── CSV Export ───────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function feedbackToCsv({ feedback, annotations, fileName, reviewMode }: ExportProps): string {
  const header = ["severity", "title", "description", "page", "section", "quote", "annotation_status", "comments"];
  const rows: string[] = [header.join(",")];

  for (let i = 0; i < feedback.findings.length; i++) {
    const f = feedback.findings[i];
    const ann = annotations?.[String(i)];
    const annotationStatus = ann?.status ?? "";
    const comments = ann?.comments?.map((c) => `${c.authorName}: ${c.text}`).join(" | ") ?? "";

    if (f.locations.length === 0) {
      rows.push(
        [
          escapeCsvField(f.severity),
          escapeCsvField(f.title),
          escapeCsvField(f.description),
          "",
          "",
          "",
          escapeCsvField(annotationStatus),
          escapeCsvField(comments),
        ].join(",")
      );
    } else {
      for (const loc of f.locations) {
        rows.push(
          [
            escapeCsvField(f.severity),
            escapeCsvField(f.title),
            escapeCsvField(f.description),
            loc.page != null ? String(loc.page) : "",
            escapeCsvField(loc.section ?? ""),
            escapeCsvField(loc.quote),
            escapeCsvField(annotationStatus),
            escapeCsvField(comments),
          ].join(",")
        );
      }
    }
  }

  // Prepend metadata as comment lines
  const meta: string[] = [];
  if (fileName) meta.push(`# File: ${fileName}`);
  if (reviewMode) meta.push(`# Mode: ${reviewMode}`);
  meta.push(`# Date: ${new Date().toISOString()}`);
  meta.push(`# Assessment: ${feedback.overallAssessment}`);
  meta.push(`# Summary: ${feedback.summary.replace(/\n/g, " ")}`);

  return [...meta, ...rows].join("\n") + "\n";
}

export function DownloadCsvButton({ feedback, annotations, fileName, reviewMode }: ExportProps) {
  const handleDownload = useCallback(() => {
    const csv = feedbackToCsv({ feedback, annotations, fileName, reviewMode });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${baseFilename(fileName)}-review.csv`);
  }, [feedback, annotations, fileName, reviewMode]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      onClick={handleDownload}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      CSV
    </Button>
  );
}

// ── JSON Export ──────────────────────────────────────────────────────────

function feedbackToJson({ feedback, annotations, fileName, reviewMode }: ExportProps): string {
  const data = {
    metadata: {
      fileName: fileName ?? null,
      reviewMode: reviewMode ?? null,
      exportedAt: new Date().toISOString(),
      overallAssessment: feedback.overallAssessment,
      summary: feedback.summary,
    },
    findings: feedback.findings.map((f, i) => {
      const ann = annotations?.[String(i)];
      return {
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        locations: f.locations,
        annotation: ann?.status ?? null,
        comments:
          ann?.comments?.map((c) => ({
            author: c.authorName,
            text: c.text,
            createdAt: c.createdAt,
          })) ?? [],
      };
    }),
    ...(feedback.failedGroups?.length
      ? {
          failedGroups: feedback.failedGroups.map((g) => ({
            groupId: g.groupId,
            label: g.label,
            error: g.error,
          })),
        }
      : {}),
  };
  return JSON.stringify(data, null, 2);
}

export function DownloadJsonButton({ feedback, annotations, fileName, reviewMode }: ExportProps) {
  const handleDownload = useCallback(() => {
    const json = feedbackToJson({ feedback, annotations, fileName, reviewMode });
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${baseFilename(fileName)}-review.json`);
  }, [feedback, annotations, fileName, reviewMode]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      onClick={handleDownload}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      JSON
    </Button>
  );
}
