"use client";

import { useState } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import type { CheckGroupState, ProviderType } from "@/types/review";
import { cn, formatTokensK, calcTokPerSec } from "@/lib/utils";
import { LiveTimer } from "./live-timer";

interface CheckGroupCardProps {
  group: CheckGroupState;
  provider: ProviderType | null;
}

export function CheckGroupCard({ group, provider }: CheckGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOllama = provider === "ollama";

  const staticElapsed =
    group.startTime && group.endTime
      ? ((group.endTime - group.startTime) / 1000).toFixed(1)
      : null;

  // Azure: hide tokens until generating phase (reasoning tokens are opaque)
  // Ollama: show tokens from the start (think-tag tokens are streamed)
  const hasNoTokensYet =
    group.status === "active" &&
    (isOllama
      ? (group.tokenCount ?? 0) === 0
      : group.phase !== "generating" && (group.tokenCount ?? 0) < 100);

  const showThinkingSummary =
    group.status === "active" &&
    group.phase !== "generating" &&
    group.thinkingSummary;

  // Parse thinking summary: last **title**, text after it is body
  let thinkingTitle = "";
  let thinkingBody = "";
  if (showThinkingSummary) {
    const matches = [...group.thinkingSummary!.matchAll(/\*\*(.+?)\*\*/g)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      thinkingTitle = last[1].trim();
      thinkingBody = group.thinkingSummary!.slice(last.index! + last[0].length).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    } else {
      thinkingBody = group.thinkingSummary!.replace(/\s+/g, " ").trim();
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 transition-all",
        group.status === "pending" &&
          "border-white/5 bg-white/[0.02]",
        group.status === "active" &&
          "border-blue-400/20 bg-blue-400/5",
        group.status === "done" &&
          "border-emerald-400/20 bg-emerald-400/5",
        group.status === "error" && "border-red-400/20 bg-red-400/5"
      )}
    >
      <div className="flex items-center gap-2.5">
        {group.status === "pending" && (
          <Circle className="h-3.5 w-3.5 shrink-0 text-white/20" />
        )}
        {group.status === "active" && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
        )}
        {group.status === "done" && (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        {group.status === "error" && (
          <X className="h-3.5 w-3.5 shrink-0 text-red-400" />
        )}

        <span
          className={cn(
            "flex-1 text-xs font-medium",
            group.status === "pending" && "text-white/30",
            group.status === "active" && "text-blue-300",
            group.status === "done" && "text-emerald-300",
            group.status === "error" && "text-red-300"
          )}
        >
          {group.label}
        </span>

        {/* Right-aligned stats: findings → phase → tokens → tok/s → time */}
        {group.status === "done" && group.findingCount !== undefined && (
          <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right text-xs text-white/40">
            {group.findingCount} {group.findingCount === 1 ? "finding" : "findings"}
          </span>
        )}

        {group.status === "active" && (
          <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right text-[10px] font-medium uppercase tracking-wider text-blue-400/50">
            {group.phase === "generating"
              ? "Generating"
              : group.phase === "thinking" || (group.tokenCount ?? 0) >= 100
                ? "Thinking"
                : "Initializing"}
          </span>
        )}

        {((group.tokenCount !== undefined && group.tokenCount > 0) || group.status === "active") && group.startTime && (
          <span className={cn(
            "min-w-[3.5rem] shrink-0 whitespace-nowrap text-right tabular-nums text-xs",
            group.status === "active" ? "text-blue-400/60" : "text-white/30"
          )}>
            {hasNoTokensYet ? "–" : formatTokensK((group.tokenCount ?? 0) + (group.reasoningTokens ?? 0))}
          </span>
        )}

        {((group.tokenCount !== undefined && group.tokenCount > 0) || group.status === "active") && group.startTime && (
          <span className={cn(
            "w-[3.5rem] shrink-0 whitespace-nowrap text-right tabular-nums text-xs",
            group.status === "active" ? "text-blue-400/60" : "text-white/30"
          )}>
            {hasNoTokensYet
              ? "–"
              : group.status === "active"
                ? calcTokPerSec(
                    isOllama
                      ? group.tokenCount!
                      : group.generatingStartTime ? group.tokenCount! - (group.generatingStartTokenCount ?? 0) : group.tokenCount!,
                    isOllama
                      ? group.startTime
                      : group.generatingStartTime ?? group.startTime,
                    group.endTime
                  ) + " t/s"
                : (isOllama
                  ? calcTokPerSec(group.tokenCount!, group.startTime, group.endTime) + " t/s"
                  : group.generatingStartTime
                    ? calcTokPerSec(group.tokenCount! - (group.generatingStartTokenCount ?? 0), group.generatingStartTime, group.endTime) + " t/s"
                    : "")}
          </span>
        )}

        {group.status === "active" && group.startTime && (
          <LiveTimer startTime={group.startTime} className="w-[3rem] shrink-0 whitespace-nowrap text-right text-xs text-blue-400/60" />
        )}

        {staticElapsed && (
          <span className="w-[3rem] shrink-0 whitespace-nowrap text-right tabular-nums text-xs text-white/30">{staticElapsed}s</span>
        )}

        {group.status === "error" && group.error && (
          <span className="max-w-[150px] truncate text-xs text-red-400/70">
            {group.error}
          </span>
        )}
      </div>

      {/* Reasoning summary preview while thinking */}
      {showThinkingSummary && (
        <div
          className="mt-1 cursor-pointer select-none"
          onClick={() => setExpanded((e) => !e)}
        >
          {thinkingTitle && (
            <p className="break-words text-[11px] text-blue-400/60">
              <span className="thinking-shimmer font-semibold">{thinkingTitle}</span>
              <span className="ml-1.5 font-normal text-blue-400/30">
                ({expanded ? "click to collapse" : "click to expand"})
              </span>
            </p>
          )}
          {thinkingBody && expanded && (
            <p className="mt-0.5 break-words text-[11px] italic text-blue-400/40">
              {thinkingBody}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
