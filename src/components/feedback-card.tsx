"use client";

import type { Finding, Severity } from "@/types/review";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FeedbackCardProps {
  finding: Finding;
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

export function FeedbackCard({ finding }: FeedbackCardProps) {
  const config = severityConfig[finding.severity];

  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 border-l-4 bg-white/5 p-3 backdrop-blur-sm transition-all hover:bg-white/[0.07]",
        config.borderColor
      )}
    >
      <div className="space-y-1.5">
        <p className="text-xs font-medium leading-snug text-white/90">
          {finding.title}
        </p>
        <p className="text-xs leading-relaxed text-white/50">
          {finding.description}
        </p>
        {finding.locations.length > 0 && (
          <div className="space-y-1 pt-1">
            {finding.locations.map((loc, i) => (
              <div key={i} className="text-[11px] leading-snug text-white/35">
                <span className="font-medium text-white/45">
                  {[loc.page != null && `p.\u00A0${loc.page}`, loc.section]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
                {" "}
                <span className="italic">
                  &ldquo;{renderQuoteWithBold(loc.quote)}&rdquo;
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
