import type { Finding, Severity } from "@/types/review";

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

/** Earliest page number referenced by a finding's locations, or Infinity if none. */
function minPage(f: Finding): number {
  const pages = f.locations.map((l) => l.page).filter((p): p is number => p != null);
  return pages.length > 0 ? Math.min(...pages) : Infinity;
}

/**
 * Return an array of global finding indices in keyboard-navigation order:
 * critical (by page) -> major (by page) -> minor (by page) -> suggestion (by page).
 *
 * This matches the visual left-to-right, top-to-bottom layout of the severity columns.
 */
export function getNavigationOrder(findings: Finding[]): number[] {
  const order: number[] = [];

  for (const severity of SEVERITY_ORDER) {
    const indices: { globalIndex: number; page: number }[] = [];
    for (let i = 0; i < findings.length; i++) {
      if (findings[i].severity === severity) {
        indices.push({ globalIndex: i, page: minPage(findings[i]) });
      }
    }
    indices.sort((a, b) => a.page - b.page);
    for (const { globalIndex } of indices) {
      order.push(globalIndex);
    }
  }

  return order;
}
