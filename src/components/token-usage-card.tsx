"use client";

import { useEffect, useState } from "react";
import type { TokenUsageRow } from "@/lib/db";
import { ALL_CHECK_GROUP_META } from "@/types/review";
import type { CheckGroupId } from "@/types/review";
import {
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  DollarSign,
} from "lucide-react";

interface Props {
  reviewId: string;
}

interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
}

export function TokenUsageCard({ reviewId }: Props) {
  const [usage, setUsage] = useState<TokenUsageRow[] | null>(null);
  const [totals, setTotals] = useState<TokenTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/review/${reviewId}/token-usage`);
        if (!res.ok) {
          if (res.status === 404) {
            // No token usage data — not an error, just empty
            if (!cancelled) {
              setUsage([]);
              setTotals({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0 });
            }
            return;
          }
          throw new Error("Failed to load token usage");
        }
        const json = await res.json();
        if (!cancelled) {
          setUsage(json.usage);
          setTotals(json.totals);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reviewId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-white/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </div>
    );
  }

  if (!usage || usage.length === 0 || !totals) {
    return null; // No usage data — hide the card entirely
  }

  const totalTokens = totals.inputTokens + totals.outputTokens + totals.reasoningTokens;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs font-medium text-white/70">Token Usage</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">
            {formatTokens(totalTokens)} tokens
          </span>
          <span className="text-xs font-medium text-green-400">
            ${totals.estimatedCostUsd.toFixed(4)}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-white/30" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-white/30" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2">
          {/* Token summary */}
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs font-semibold text-white/70">{formatTokens(totals.inputTokens)}</div>
              <div className="text-[10px] text-white/30">Input</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-white/70">{formatTokens(totals.outputTokens)}</div>
              <div className="text-[10px] text-white/30">Output</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-white/70">{formatTokens(totals.reasoningTokens)}</div>
              <div className="text-[10px] text-white/30">Reasoning</div>
            </div>
          </div>

          {/* Per-check-group breakdown */}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/30">
                <th className="pb-1.5 pr-2 font-medium">Check Group</th>
                <th className="pb-1.5 pr-2 font-medium text-right">In</th>
                <th className="pb-1.5 pr-2 font-medium text-right">Out</th>
                <th className="pb-1.5 pr-2 font-medium text-right">Think</th>
                <th className="pb-1.5 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {usage.map((row) => {
                const label = ALL_CHECK_GROUP_META[row.checkGroup as CheckGroupId]?.label ?? row.checkGroup;
                return (
                  <tr key={row.id}>
                    <td className="py-1.5 pr-2 text-white/50">{label}</td>
                    <td className="py-1.5 pr-2 text-right text-white/40">{formatTokens(row.inputTokens)}</td>
                    <td className="py-1.5 pr-2 text-right text-white/40">{formatTokens(row.outputTokens)}</td>
                    <td className="py-1.5 pr-2 text-right text-white/40">{formatTokens(row.reasoningTokens)}</td>
                    <td className="py-1.5 text-right text-white/50">${row.estimatedCostUsd.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}
