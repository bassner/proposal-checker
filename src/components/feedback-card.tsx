"use client";

import { useState } from "react";
import type { Finding, Severity, AnnotationStatus, AnnotationEntry } from "@/types/review";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Wrench } from "lucide-react";

interface FeedbackCardProps {
  finding: Finding;
  annotation?: AnnotationEntry;
  onAnnotate?: (status: AnnotationStatus) => void;
}

const severityConfig: Record<
  Severity,
  { borderColor: string }
> = {
  critical: { borderColor: "border-l-red-500" },
  major: { borderColor: "border-l-orange-500" },
  minor: { borderColor: "border-l-yellow-500" },
  suggestion: { borderColor: "border-l-blue-500" },
};

const annotationButtons: { status: AnnotationStatus; icon: typeof Check; label: string }[] = [
  { status: "accepted", icon: Check, label: "Accept" },
  { status: "dismissed", icon: X, label: "Dismiss" },
  { status: "fixed", icon: Wrench, label: "Fixed" },
];

function renderQuoteWithBold(quote: string): ReactNode {
  const parts = quote.split("**");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-white/70">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function FeedbackCard({ finding, annotation, onAnnotate }: FeedbackCardProps) {
  const config = severityConfig[finding.severity];
  const [locationsExpanded, setLocationsExpanded] = useState(false);

  const sortedLocations = [...finding.locations].sort((a, b) => {
    const pa = a.page ?? Infinity;
    const pb = b.page ?? Infinity;
    return pa - pb;
  });

  const visibleLocations = locationsExpanded ? sortedLocations : sortedLocations.slice(0, 4);
  const hiddenCount = sortedLocations.length - 4;

  const isDismissed = annotation?.status === "dismissed";
  const isFixed = annotation?.status === "fixed";

  return (
    <div
      className={cn(
        "print-card rounded-lg border border-white/10 border-l-4 bg-white/5 p-3 backdrop-blur-sm transition-all hover:bg-white/[0.07]",
        // Default severity border, overridden by annotation state
        !annotation && config.borderColor,
        isFixed && "border-l-emerald-500 bg-emerald-500/5",
        isDismissed && "border-l-white/20 opacity-50",
      )}
    >
      <div className="space-y-1.5">
        <p className={cn(
          "text-xs font-medium leading-snug text-white/90",
          isDismissed && "line-through text-white/40"
        )}>
          {finding.title}
        </p>
        <p className={cn(
          "text-xs leading-relaxed text-white/50",
          isDismissed && "text-white/25"
        )}>
          {finding.description}
        </p>
        {sortedLocations.length > 0 && (
          <div className="space-y-1 pt-1">
            {visibleLocations.map((loc, i) => (
              <div key={i} className="text-[11px] leading-snug text-white/35">
                <span className="font-medium text-white/45">
                  {[loc.page != null && `p.\u00A0${loc.page}`, loc.section]
                    .filter(Boolean)
                    .join(" · ") || "\u2014"}
                </span>
                {" "}
                <span className="italic">
                  &ldquo;{renderQuoteWithBold(loc.quote)}&rdquo;
                </span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
                onClick={() => setLocationsExpanded((e) => !e)}
              >
                {locationsExpanded
                  ? "show less"
                  : `+${hiddenCount} more source${hiddenCount === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        )}

        {/* Annotation action buttons */}
        {onAnnotate && (
          <div className="no-print flex items-center gap-1 pt-1.5">
            {annotationButtons.map(({ status, icon: Icon, label }) => {
              const isActive = annotation?.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-label={isActive ? `Remove ${label.toLowerCase()} mark` : `Mark as ${label.toLowerCase()}`}
                  aria-pressed={isActive}
                  onClick={() => onAnnotate(status)}
                  className={cn(
                    "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                    isActive
                      ? status === "accepted"
                        ? "bg-blue-500/20 text-blue-300"
                        : status === "dismissed"
                          ? "bg-white/10 text-white/50"
                          : "bg-emerald-500/20 text-emerald-300"
                      : "text-white/25 hover:text-white/50 hover:bg-white/5"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
