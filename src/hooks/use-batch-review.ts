"use client";

import { useState, useCallback } from "react";
import type { ProviderType, ReviewMode, CheckGroupId } from "@/types/review";

export type BatchFileStatus = "queued" | "uploading" | "done" | "error";

export interface BatchFileEntry {
  file: File;
  status: BatchFileStatus;
  error?: string;
  reviewId?: string;
}

/**
 * Hook for batch-uploading multiple PDFs. Submits each file as a separate
 * POST /api/review request, tracking per-file status independently.
 * Returns only after all files have been submitted (or failed).
 */
export function useBatchReview() {
  const [files, setFiles] = useState<BatchFileEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [
      ...prev,
      ...newFiles.map((file) => ({ file, status: "queued" as const })),
    ]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const submitAll = useCallback(
    async (
      provider: ProviderType,
      mode: ReviewMode,
      selectedGroups?: CheckGroupId[],
      opts?: { supervisorId?: string; studentId?: string }
    ): Promise<{ successCount: number; totalCount: number }> => {
      setIsSubmitting(true);
      let successCount = 0;
      const totalCount = files.length;

      for (let i = 0; i < files.length; i++) {
        // Mark current file as uploading
        setFiles((prev) =>
          prev.map((entry, idx) =>
            idx === i ? { ...entry, status: "uploading" } : entry
          )
        );

        const formData = new FormData();
        formData.append("file", files[i].file);
        formData.append("provider", provider);
        formData.append("mode", mode);
        if (selectedGroups && selectedGroups.length > 0) {
          formData.append("selectedGroups", JSON.stringify(selectedGroups));
        }
        if (opts?.supervisorId) formData.append("supervisorId", opts.supervisorId);
        if (opts?.studentId) formData.append("studentId", opts.studentId);

        try {
          const response = await fetch("/api/review", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Request failed" }));
            let errorMessage = errorData.error || "Request failed";

            if (response.status === 429 && errorData.retryAfter) {
              const retrySeconds = errorData.retryAfter;
              const retryMinutes = Math.ceil(retrySeconds / 60);
              if (retryMinutes === 1) {
                errorMessage += ". Try again in 1 minute.";
              } else if (retryMinutes < 60) {
                errorMessage += `. Try again in ${retryMinutes} minutes.`;
              } else {
                const retryHours = Math.ceil(retryMinutes / 60);
                errorMessage += `. Try again in ${retryHours} hour${retryHours > 1 ? "s" : ""}.`;
              }
            }

            setFiles((prev) =>
              prev.map((entry, idx) =>
                idx === i ? { ...entry, status: "error", error: errorMessage } : entry
              )
            );
          } else {
            const { id } = await response.json();
            setFiles((prev) =>
              prev.map((entry, idx) =>
                idx === i ? { ...entry, status: "done", reviewId: id } : entry
              )
            );
            successCount++;
          }
        } catch (err) {
          setFiles((prev) =>
            prev.map((entry, idx) =>
              idx === i
                ? {
                    ...entry,
                    status: "error",
                    error: err instanceof Error ? err.message : "An unknown error occurred",
                  }
                : entry
            )
          );
        }
      }

      setIsSubmitting(false);
      return { successCount, totalCount };
    },
    [files]
  );

  return { files, addFiles, removeFile, clearFiles, submitAll, isSubmitting };
}
