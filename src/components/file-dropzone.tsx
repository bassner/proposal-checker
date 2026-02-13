"use client";

import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/use-file-upload";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  onMultiFileSelect?: (files: File[]) => void;
  disabled?: boolean;
  selectedFile: File | null;
  onClear: () => void;
}

/**
 * PDF upload zone with drag-and-drop support. Shows a drop target when no file
 * is selected, or a compact file info bar with a clear button when a file is chosen.
 * Validates file type and size client-side before propagating via `onFileSelect`.
 *
 * When `onMultiFileSelect` is provided, accepts multiple files via the picker and
 * drag-and-drop. If multiple valid files are selected, calls `onMultiFileSelect`
 * instead of `onFileSelect`. Single-file selection still uses `onFileSelect`.
 */
export function FileDropzone({
  onFileSelect,
  onMultiFileSelect,
  disabled,
  selectedFile,
  onClear,
}: FileDropzoneProps) {
  const {
    error,
    isDragging,
    inputRef,
    onDragOver,
    onDragLeave,
    validate,
    onDrop: hookOnDrop,
    onInputChange: hookOnInputChange,
    openPicker,
  } = useFileUpload();

  const handleDrop = (e: React.DragEvent) => {
    // Read files before hookOnDrop processes the event
    const fileList = e.dataTransfer.files;
    const allFiles = Array.from(fileList);

    // Always let the hook handle drag state reset + preventDefault
    hookOnDrop(e);

    if (allFiles.length > 1 && onMultiFileSelect) {
      // Batch mode: validate each, pass all valid ones
      const valid = allFiles.filter((f) => !validate(f));
      if (valid.length > 0) {
        onMultiFileSelect(valid);
      }
    } else {
      const droppedFile = allFiles[0];
      if (droppedFile && !validate(droppedFile)) {
        onFileSelect(droppedFile);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const allFiles = Array.from(fileList);

    if (allFiles.length > 1 && onMultiFileSelect) {
      // Batch mode
      const valid = allFiles.filter((f) => !validate(f));
      if (valid.length > 0) {
        onMultiFileSelect(valid);
      }
      // Reset input so the same files can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    } else {
      // Single file — use existing hook behavior
      hookOnInputChange(e);
      const selectedFileFromInput = allFiles[0];
      if (selectedFileFromInput && !validate(selectedFileFromInput)) {
        onFileSelect(selectedFileFromInput);
      }
    }
  };

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-sm">
        <FileText className="h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {selectedFile.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-white/50">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"
          onClick={onClear}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
        onClick={disabled ? undefined : openPicker}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-all",
          isDragging
            ? "border-blue-400 bg-blue-50 dark:bg-blue-400/10"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-white/20 dark:bg-white/5 dark:hover:border-white/30 dark:hover:bg-white/[0.07]",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Upload className="mb-3 h-8 w-8 text-slate-400 dark:text-white/40" />
        <p className="text-sm font-medium text-slate-600 dark:text-white/70">
          Drop your proposal PDF here
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-white/40">
          {onMultiFileSelect ? "or click to browse (multiple files supported)" : "or click to browse"}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple={!!onMultiFileSelect}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
      {error && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
