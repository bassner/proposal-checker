"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * Dark-mode-only theme provider.
 * Ensures the `dark` class is always on <html> and cleans up any stale
 * localStorage value so the flash-prevention script stays in sync.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    // Clear any legacy stored theme preference
    try { localStorage.removeItem("theme"); } catch { /* noop */ }
  }, []);

  return <>{children}</>;
}
