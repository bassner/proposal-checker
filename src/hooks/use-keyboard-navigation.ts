"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseGridNavigationOptions {
  /** Grid columns — columns[colIdx] is an array of global finding indices for that column. */
  columns: number[][];
  /** Set to false to disable keyboard listeners. */
  enabled?: boolean;
  /** Called when an action shortcut is pressed on a focused item. */
  onAction?: (action: "fixed" | "dismissed" | "comment", globalIndex: number) => void;
}

/**
 * 2D grid keyboard navigation for findings laid out in severity columns.
 *
 * Navigation:
 * - j / ArrowDown: next item in current column (wraps)
 * - k / ArrowUp: previous item in current column (wraps)
 * - ArrowRight: next column (clamp row to column length)
 * - ArrowLeft: previous column (clamp row to column length)
 * - Escape: deselect
 *
 * Actions (only when an item is focused):
 * - f: mark as fixed
 * - d: dismiss
 * - c: open comment
 *
 * Inactive when focus is on interactive elements (inputs, textareas, etc.)
 * or when modifier keys are held.
 */
export function useGridNavigation({
  columns,
  enabled = true,
  onAction,
}: UseGridNavigationOptions) {
  const [pos, setPos] = useState<{ col: number; row: number } | null>(null);

  const posRef = useRef(pos);
  const columnsRef = useRef(columns);
  const onActionRef = useRef(onAction);

  useEffect(() => { columnsRef.current = columns; }, [columns]);
  useEffect(() => { onActionRef.current = onAction; }, [onAction]);

  // Wrapper that keeps posRef in sync synchronously
  const updatePos = useCallback(
    (updater: (prev: { col: number; row: number } | null) => { col: number; row: number } | null) => {
      setPos((prev) => {
        const next = updater(prev);
        posRef.current = next;
        return next;
      });
    },
    [],
  );

  // Clamp/reset position when grid shape changes
  useEffect(() => {
    updatePos((prev) => {
      if (prev === null) return null;
      if (prev.col < columns.length && prev.row < (columns[prev.col]?.length ?? 0)) return prev;
      if (prev.col < columns.length && columns[prev.col]?.length > 0) {
        return { col: prev.col, row: Math.min(prev.row, columns[prev.col].length - 1) };
      }
      return null;
    });
  }, [columns, updatePos]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;

    const cols = columnsRef.current;
    if (cols.reduce((s, c) => s + c.length, 0) === 0) return;

    const target = e.target as HTMLElement;

    // Inside text fields — only Escape blurs
    if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable=\"false\"])")) {
      if (e.key === "Escape") {
        target.blur();
      }
      return;
    }

    // On buttons/links — skip letter shortcuts, allow arrows and Escape
    const onInteractive = !!target.closest("button, a, [role=\"button\"], [role=\"link\"]");

    const cur = posRef.current;

    switch (e.key) {
      case "j":
        if (onInteractive) return;
        // fall through
      case "ArrowDown": {
        e.preventDefault();
        updatePos((prev) => {
          if (prev === null) {
            for (let c = 0; c < cols.length; c++) if (cols[c].length > 0) return { col: c, row: 0 };
            return null;
          }
          const col = cols[prev.col];
          if (!col || col.length === 0) return prev;
          return { col: prev.col, row: (prev.row + 1) % col.length };
        });
        break;
      }
      case "k":
        if (onInteractive) return;
        // fall through
      case "ArrowUp": {
        e.preventDefault();
        updatePos((prev) => {
          if (prev === null) {
            for (let c = 0; c < cols.length; c++) if (cols[c].length > 0) return { col: c, row: cols[c].length - 1 };
            return null;
          }
          const col = cols[prev.col];
          if (!col || col.length === 0) return prev;
          return { col: prev.col, row: (prev.row - 1 + col.length) % col.length };
        });
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        updatePos((prev) => {
          if (prev === null) {
            for (let c = 0; c < cols.length; c++) if (cols[c].length > 0) return { col: c, row: 0 };
            return null;
          }
          for (let c = prev.col + 1; c < cols.length; c++) {
            if (cols[c].length > 0) return { col: c, row: Math.min(prev.row, cols[c].length - 1) };
          }
          return prev;
        });
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        updatePos((prev) => {
          if (prev === null) {
            for (let c = cols.length - 1; c >= 0; c--) if (cols[c].length > 0) return { col: c, row: 0 };
            return null;
          }
          for (let c = prev.col - 1; c >= 0; c--) {
            if (cols[c].length > 0) return { col: c, row: Math.min(prev.row, cols[c].length - 1) };
          }
          return prev;
        });
        break;
      }
      case "Escape":
        updatePos(() => null);
        break;
      case "f": {
        if (onInteractive || cur === null) return;
        const gi = cols[cur.col]?.[cur.row];
        if (gi != null) onActionRef.current?.("fixed", gi);
        break;
      }
      case "d": {
        if (onInteractive || cur === null) return;
        const gi = cols[cur.col]?.[cur.row];
        if (gi != null) onActionRef.current?.("dismissed", gi);
        break;
      }
      case "c": {
        if (onInteractive || cur === null) return;
        const gi = cols[cur.col]?.[cur.row];
        if (gi != null) onActionRef.current?.("comment", gi);
        break;
      }
      default:
        return;
    }
  }, [updatePos]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  const focusedGlobalIndex = pos !== null ? columns[pos.col]?.[pos.row] ?? null : null;

  // Click-to-select (toggles if same item clicked again)
  const setFocusedGlobalIndex = useCallback((globalIndex: number | null) => {
    if (globalIndex === null) {
      updatePos(() => null);
      return;
    }
    updatePos((prev) => {
      if (prev !== null) {
        const currentGi = columnsRef.current[prev.col]?.[prev.row];
        if (currentGi === globalIndex) return null; // Toggle off
      }
      const cols = columnsRef.current;
      for (let c = 0; c < cols.length; c++) {
        const r = cols[c].indexOf(globalIndex);
        if (r !== -1) return { col: c, row: r };
      }
      return prev;
    });
  }, [updatePos]);

  return { focusedGlobalIndex, setFocusedGlobalIndex };
}
