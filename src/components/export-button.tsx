"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer, ClipboardCopy, Check } from "lucide-react";
import type { MergedFeedback } from "@/types/review";
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
