"use client";

import { useState } from "react";
import { Loader2, Check, AlertCircle, Save } from "lucide-react";
import type { SeverityWeightRow } from "@/lib/db";

interface Props {
  initialWeights: SeverityWeightRow[];
}

const SEVERITY_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  critical: { dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-400" },
  major: { dot: "bg-orange-500", bg: "bg-orange-500/10", text: "text-orange-400" },
  minor: { dot: "bg-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  suggestion: { dot: "bg-blue-500", bg: "bg-blue-500/10", text: "text-blue-400" },
};

export function SeverityConfigEditor({ initialWeights }: Props) {
  const [weights, setWeights] = useState(initialWeights);
  const [editValues, setEditValues] = useState<Record<string, string>>(
    Object.fromEntries(initialWeights.map((w) => [w.severity, String(w.weight)]))
  );
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const hasChanges = (severity: string) => {
    const current = weights.find((w) => w.severity === severity);
    if (!current) return false;
    const val = parseInt(editValues[severity], 10);
    return !isNaN(val) && val !== current.weight;
  };

  const saveWeight = async (severity: string) => {
    const val = parseInt(editValues[severity], 10);
    if (isNaN(val) || val < 0 || val > 100) {
      setError("Weight must be between 0 and 100");
      setTimeout(() => setError(null), 5000);
      return;
    }

    if (saving[severity]) return;

    setSaving((prev) => ({ ...prev, [severity]: true }));
    setSuccess((prev) => ({ ...prev, [severity]: false }));
    setError(null);

    try {
      const res = await fetch("/api/admin/severity-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity, weight: val }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Update failed");
      }

      const { weight: updated } = await res.json();
      setWeights((prev) =>
        prev.map((w) => (w.severity === updated.severity ? updated : w))
      );
      setEditValues((prev) => ({ ...prev, [updated.severity]: String(updated.weight) }));
      setSuccess((prev) => ({ ...prev, [severity]: true }));
      setTimeout(() => setSuccess((prev) => ({ ...prev, [severity]: false })), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving((prev) => ({ ...prev, [severity]: false }));
    }
  };

  // Compute a preview score based on current edit values
  const previewScore = (() => {
    const maxScore = 100;
    // Example: assume 1 of each finding type for preview
    const exampleDeductions = weights.map((w) => {
      const val = parseInt(editValues[w.severity], 10);
      return isNaN(val) ? w.weight : val;
    });
    const total = exampleDeductions.reduce((sum, d) => sum + d, 0);
    return Math.max(0, maxScore - total);
  })();

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 pr-6 text-xs font-medium text-white/40">Severity</th>
              <th className="pb-2 pr-4 text-xs font-medium text-white/40">Weight (points)</th>
              <th className="pb-2 text-xs font-medium text-white/40"></th>
            </tr>
          </thead>
          <tbody>
            {weights.map((w) => {
              const colors = SEVERITY_COLORS[w.severity] ?? {
                dot: "bg-slate-500",
                bg: "bg-slate-500/10",
                text: "text-slate-400",
              };
              return (
                <tr key={w.severity} className="border-b border-white/5">
                  <td className="py-3 pr-6">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                      <span className={`font-medium ${colors.text}`}>{w.label}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editValues[w.severity]}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [w.severity]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && hasChanges(w.severity)) {
                          saveWeight(w.severity);
                        }
                      }}
                      className="w-20 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm tabular-nums text-white/80 outline-none transition-colors focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {hasChanges(w.severity) && (
                        <button
                          type="button"
                          onClick={() => saveWeight(w.severity)}
                          disabled={saving[w.severity]}
                          className="flex items-center gap-1 rounded-lg bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
                        >
                          {saving[w.severity] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          Save
                        </button>
                      )}
                      {success[w.severity] && (
                        <Check className="h-4 w-4 text-green-400" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">
          Score preview (1 finding per severity)
        </p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums text-white/80">
            {previewScore}
          </span>
          <span className="text-xs text-white/30">/ 100</span>
          <div className="ml-2 flex-1">
            <div className="h-2 rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${previewScore}%` }}
              />
            </div>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-white/20">
          Formula: 100 - sum(finding_weight), clamped to [0, 100]
        </p>
      </div>
    </div>
  );
}
