"use client";

import { FileText, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BatchFileEntry } from "@/hooks/use-batch-review";

interface BatchFileListProps {
  files: BatchFileEntry[];
  onRemove: (index: number) => void;
  onClear: () => void;
  disabled?: boolean;
}

const STATUS_CONFIG = {
  queued: { icon: FileText, color: "text-white/50", label: "Queued" },
  uploading: { icon: Loader2, color: "text-blue-400", label: "Uploading..." },
  done: { icon: CheckCircle, color: "text-green-400", label: "Submitted" },
  error: { icon: AlertCircle, color: "text-red-400", label: "Failed" },
} as const;

export function BatchFileList({ files, onRemove, onClear, disabled }: BatchFileListProps) {
  if (files.length === 0) return null;

  const queuedCount = files.filter((f) => f.status === "queued").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/50">
          {files.length} file{files.length !== 1 ? "s" : ""} selected
          {doneCount > 0 && (
            <span className="ml-2 text-green-400/70">
              {doneCount} submitted
            </span>
          )}
          {errorCount > 0 && (
            <span className="ml-2 text-red-400/70">
              {errorCount} failed
            </span>
          )}
        </span>
        {queuedCount === files.length && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-xs text-white/40 transition-colors hover:text-white/60 disabled:opacity-40"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
        {files.map((entry, index) => {
          const config = STATUS_CONFIG[entry.status];
          const Icon = config.icon;

          return (
            <div
              key={`${entry.file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]"
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${config.color} ${
                  entry.status === "uploading" ? "animate-spin" : ""
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/80">{entry.file.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/40">
                    {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  {entry.error && (
                    <span className="truncate text-[11px] text-red-400/80">
                      {entry.error}
                    </span>
                  )}
                </div>
              </div>
              {entry.status === "queued" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-white/30 hover:text-white/60"
                  onClick={() => onRemove(index)}
                  disabled={disabled}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
