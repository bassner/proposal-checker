"use client";

import { useState, useCallback, useRef } from "react";

// Generous client-side limit; server enforces the real limit via MAX_PDF_SIZE_MB env var.
const MAX_SIZE_MB = 50;

/**
 * Headless file-upload hook providing drag-and-drop state, validation, and a
 * hidden `<input>` ref. The `validate` function is also exported so the parent
 * component (FileDropzone) can validate independently of internal state updates
 * — needed because React synthetic events lose their data by the next tick.
 */
export function useFileUpload() {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((f: File): string | null => {
    if (f.type !== "application/pdf") {
      return "Only PDF files are accepted";
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`;
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const err = validate(f);
      setError(err);
    },
    [validate]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFile(selectedFile);
      }
    },
    [handleFile]
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  return {
    error,
    isDragging,
    inputRef,
    onDragOver,
    onDragLeave,
    validate,
    onDrop,
    onInputChange,
    openPicker,
    clear,
  };
}
