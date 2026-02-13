"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ProviderType } from "@/types/review";
import { cn } from "@/lib/utils";
import { X, Upload, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadVersionModalProps {
  open: boolean;
  onClose: () => void;
  parentReviewId: string;
  parentProvider: ProviderType;
}

export function UploadVersionModal({
  open,
  onClose,
  parentReviewId,
  parentProvider,
}: UploadVersionModalProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderType>(parentProvider);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_SIZE_MB = 10; // Must match MAX_PDF_SIZE_MB env var (default: 10)

  const validateAndSetFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      setFileError("Only PDF files are accepted");
      setFile(null);
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(f);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!file || submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);

      const res = await fetch(`/api/review/${parentReviewId}/version`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error || "Failed to upload version");
        setSubmitting(false);
        return;
      }

      const { id, duplicate } = await res.json();
      const dupParam = duplicate ? "?duplicate=true" : "";
      router.push(`/review/${id}${dupParam}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setSubmitting(false);
    }
  }, [file, submitting, provider, parentReviewId, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Upload next version"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-semibold text-white/80">Upload Next Version</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Help text */}
          <p className="text-xs text-white/40">
            Upload a revised version of your document. The AI will compare against the
            previous review and focus on what changed.
          </p>

          {/* Drop zone */}
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors",
              isDragging
                ? "border-blue-400/50 bg-blue-400/10"
                : file
                  ? "border-emerald-400/30 bg-emerald-400/5"
                  : "border-white/10 hover:border-white/20 hover:bg-white/[0.03]"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) validateAndSetFile(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) validateAndSetFile(e.target.files[0]);
              }}
            />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-emerald-400/60" />
                <div className="text-center">
                  <p className="text-sm font-medium text-white/70">{file.name}</p>
                  <p className="text-xs text-white/30">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-white/20" />
                <p className="text-xs text-white/40">
                  Drop your revised PDF here or click to browse
                </p>
              </>
            )}
          </div>

          {fileError && (
            <p className="text-xs text-red-400">{fileError}</p>
          )}

          {/* Provider selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/40">Provider:</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderType)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 outline-none focus:border-white/20"
            >
              <option value="azure">Azure</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="text-white/50 hover:text-white/70"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!file || submitting}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Upload &amp; Review
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
