"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseKeyboardNavigationOptions {
  /** Total number of navigable items. */
  itemCount: number;
  /** Called when Enter is pressed on the focused item (receives nav index). */
  onSelect?: (index: number) => void;
  /** Set to false to disable the listener entirely. */
  enabled?: boolean;
}

/**
 * Keyboard navigation hook for a flat list of items.
 * - j / ArrowDown: next item (wraps)
 * - k / ArrowUp: previous item (wraps)
 * - Enter: select focused item
 * - Escape: deselect
 *
 * Inactive when focus is on interactive elements (inputs, buttons, links, etc.)
 * or when modifier keys are held.
 */
export function useKeyboardNavigation({
  itemCount,
  onSelect,
  enabled = true,
}: UseKeyboardNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Refs to avoid stale closures in the keydown handler (synced via effects)
  const focusedRef = useRef(focusedIndex);
  const onSelectRef = useRef(onSelect);
  const itemCountRef = useRef(itemCount);

  useEffect(() => { focusedRef.current = focusedIndex; }, [focusedIndex]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { itemCountRef.current = itemCount; }, [itemCount]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip when modifiers are held, during IME composition, or if already handled
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;

    // Skip if item count is zero
    if (itemCountRef.current === 0) return;

    // Skip when focus is on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])')) {
      return;
    }

    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        if (prev === null) return 0;
        return (prev + 1) % itemCountRef.current;
      });
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        if (prev === null) return itemCountRef.current - 1;
        return (prev - 1 + itemCountRef.current) % itemCountRef.current;
      });
    } else if (e.key === "Escape") {
      setFocusedIndex(null);
    } else if (e.key === "Enter" && focusedRef.current !== null) {
      e.preventDefault();
      onSelectRef.current?.(focusedRef.current);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  // Clamp focused index if it's out of bounds for the current item count.
  // Derived during render — no effect needed.
  const clampedIndex = focusedIndex !== null && focusedIndex >= itemCount ? null : focusedIndex;

  return { focusedIndex: clampedIndex, setFocusedIndex };
}
