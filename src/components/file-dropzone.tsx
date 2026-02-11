"use client";

import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/use-file-upload";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  selectedFile: File | null;
  onClear: () => void;
}

/**
 * PDF upload zone with drag-and-drop support. Shows a drop target when no file
 * is selected, or a compact file info bar with a clear button when a file is chosen.
 * Validates file type and size client-side before propagating via `onFileSelect`.
 */
export function FileDropzone({
  onFileSelect,
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

  // Both handlers call the hook's handler (for internal state) then validate
  // independently to propagate to the parent. validate() returns null on success,
  // so `!validate(f)` means the file passed validation.
  const handleDrop = (e: React.DragEvent) => {
    hookOnDrop(e);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && !validate(droppedFile)) {
      onFileSelect(droppedFile);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    hookOnInputChange(e);
    const selectedFileFromInput = e.target.files?.[0];
    if (selectedFileFromInput && !validate(selectedFileFromInput)) {
      onFileSelect(selectedFileFromInput);
    }
  };

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <FileText className="h-5 w-5 shrink-0 text-blue-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {selectedFile.name}
          </p>
          <p className="text-xs text-white/50">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/50 hover:text-white"
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
            ? "border-blue-400 bg-blue-400/10"
            : "border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/[0.07]",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Upload className="mb-3 h-8 w-8 text-white/40" />
        <p className="text-sm font-medium text-white/70">
          Drop your proposal PDF here
        </p>
        <p className="mt-1 text-xs text-white/40">or click to browse</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
