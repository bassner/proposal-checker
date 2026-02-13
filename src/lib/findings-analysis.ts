import type { Finding, Severity } from "@/types/review";

export interface PageDensityEntry {
  total: number;
  bySeverity: Record<Severity, number>;
}

/** Key: page number (use -1 for findings with no page location). */
export type PageDensityMap = Map<number, PageDensityEntry>;

const EMPTY_SEVERITY_COUNTS: Record<Severity, number> = {
  critical: 0,
  major: 0,
  minor: 0,
  suggestion: 0,
};

/**
 * Build a map from page number to finding density (total + per-severity breakdown).
 *
 * Findings with no page location are grouped under key `-1` ("Unlocated").
 * A finding that references multiple pages is counted once per unique page.
 */
export function getPageDensity(findings: Finding[]): PageDensityMap {
  const map: PageDensityMap = new Map();

  for (const finding of findings) {
    // Collect unique pages for this finding (deduplicate within a single finding)
    const pages = new Set<number>();
    for (const loc of finding.locations) {
      if (loc.page != null) {
        pages.add(loc.page);
      }
    }

    // If no page locations at all, group under -1
    if (pages.size === 0) {
      pages.add(-1);
    }

    for (const page of pages) {
      let entry = map.get(page);
      if (!entry) {
        entry = { total: 0, bySeverity: { ...EMPTY_SEVERITY_COUNTS } };
        map.set(page, entry);
      }
      entry.total++;
      entry.bySeverity[finding.severity]++;
    }
  }

  return map;
}

/**
 * Return pages sorted by finding density (highest first).
 * Only pages meeting or exceeding `threshold` findings are included.
 * The special -1 key (unlocated) is excluded from hotspot results.
 */
export function getHotspotPages(
  findings: Finding[],
  threshold = 1,
): { page: number; total: number; bySeverity: Record<Severity, number> }[] {
  const density = getPageDensity(findings);
  const results: { page: number; total: number; bySeverity: Record<Severity, number> }[] = [];

  for (const [page, entry] of density) {
    if (page === -1) continue; // Skip unlocated
    if (entry.total >= threshold) {
      results.push({ page, ...entry });
    }
  }

  return results.sort((a, b) => b.total - a.total);
}
