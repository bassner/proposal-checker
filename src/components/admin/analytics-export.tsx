"use client";

import { useState } from "react";
import { Download, Calendar, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";

type ExportFormat = "csv" | "json";

export function AnalyticsExport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ format });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/analytics/export?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }

      // Extract filename from Content-Disposition or use fallback
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `analytics.${format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Date range inputs */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 text-xs text-white/40">
            <Calendar className="h-3 w-3" />
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 text-xs text-white/40">
            <Calendar className="h-3 w-3" />
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
          />
        </div>

        {/* Format toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-white/40">Format</span>
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setFormat("csv")}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                format === "csv"
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <FileSpreadsheet className="h-3 w-3" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => setFormat("json")}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                format === "json"
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <FileJson className="h-3 w-3" />
              JSON
            </button>
          </div>
        </div>

        {/* Export button */}
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-4 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {loading ? "Exporting..." : "Export"}
        </button>
      </div>

      {/* Hint text */}
      <p className="text-[10px] text-white/30">
        Leave dates empty to export all reviews. Data includes review ID, user email, file name, status, provider, review mode, finding count, and creation date.
      </p>
    </div>
  );
}
