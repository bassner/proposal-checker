import type { ProviderType, ReviewMode, Finding, ResolvedPreviousFinding, FindingAdjudication } from "@/types/review";
import type { CheckGroupId, CheckGroupMeta, LLMPhase, MergedFeedback, FailedGroupInfo, VersionComparison } from "@/types/review";
import { getCheckGroups, ALL_CHECK_GROUP_META, normalizeFindingCategory } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { createModel } from "@/lib/llm/provider";
import { extractPDFText } from "@/lib/pdf/extract";
import { renderPDFPages } from "@/lib/pdf/render";
import { runAllChecks } from "@/lib/llm/parallel-runner";
import { mergeFindings } from "@/lib/llm/merger";
import type { MergerRevisionContext } from "@/lib/llm/merger";
import { getCheckGroupPrompts } from "@/lib/llm/prompts";
import { countTokens } from "@/lib/llm/tokens";

const PIPELINE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/** Max serialized chars for resolution reports passed to the merger. */
const MAX_RESOLUTION_REPORT_CHARS = 4000;

/**
 * Event callbacks from the review pipeline, wired to SSE emission in the route handler.
 * Each callback maps to a distinct SSE event type the client can render progressively.
 */
export interface PipelineCallbacks {
  /** A pipeline step (extract, check, merge) changed status ("active" | "done"). */
  onStep: (step: string, status: string) => void;
  onCheckStart: (groupId: CheckGroupId) => void;
  onCheckComplete: (groupId: CheckGroupId, findingCount: number, usage: TokenUsage | null) => void;
  onCheckFailed: (groupId: CheckGroupId, error: string) => void;
  /** Streaming token count update for a running check (throttled by the route). */
  onCheckTokens: (groupId: CheckGroupId, tokens: number, phase: LLMPhase) => void;
  onCheckThinking: (groupId: CheckGroupId, text: string) => void;
  onMergeTokens: (tokens: number, phase: LLMPhase) => void;
  onMergeThinking: (text: string) => void;
  onMergeUsage: (usage: TokenUsage) => void;
  /** Estimated input token count (for cost/progress display). Called once per stage. */
  onInputEstimate: (tokens: number) => void;
  onResult: (feedback: MergedFeedback) => void;
  onError: (error: string) => void;
}

/**
 * End-to-end review pipeline: extract text -> render pages -> run parallel
 * LLM checks -> merge/deduplicate findings -> deliver results.
 *
 * Designed to run fire-and-forget from the route handler. All progress is
 * communicated via {@link PipelineCallbacks} (which emit SSE events). A 15-minute
 * timeout aborts the entire pipeline if any step hangs.
 *
 * @param pdfBuffer - Raw PDF bytes from the uploaded file.
 * @param provider  - Which LLM backend to use ("azure" or "ollama").
 * @param callbacks - Event callbacks wired to the session's SSE emitter.
 */
export async function runReviewPipeline(
  pdfBuffer: ArrayBuffer,
  provider: ProviderType,
  mode: ReviewMode,
  callbacks: PipelineCallbacks,
  selectedGroups?: CheckGroupId[],
  reviewId?: string,
  options?: {
    /** Findings from the previous version for diff-aware review. */
    previousFindings?: Finding[];
    /** Previous version's overall assessment. */
    previousAssessment?: string;
    /** Previous review ID (for version comparison tracking). */
    previousReviewId?: string;
    /** User adjudication decisions on previous findings. */
    previousAdjudications?: ReadonlyMap<number, FindingAdjudication>;
  }
): Promise<void> {
  const maxPagesProposal = parseInt(process.env.MAX_PDF_PAGES || "20", 10);
  const maxPagesThesis = parseInt(process.env.MAX_PDF_PAGES_THESIS || "100", 10);
  const maxPages = mode === "thesis" ? maxPagesThesis : maxPagesProposal;

  const pipelineAbort = new AbortController();
  const pipelineTimeout = setTimeout(() => pipelineAbort.abort(), PIPELINE_TIMEOUT_MS);

  try {
    // Copy buffer — unpdf can detach the original ArrayBuffer
    const bufferCopy = pdfBuffer.slice(0);

    // Step 1: Extract text
    callbacks.onStep("extract", "active");
    console.log(`[pipeline] Extracting text from PDF (${(bufferCopy.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    const extraction = await extractPDFText(bufferCopy);
    console.log(`[pipeline] Extracted ${extraction.pageCount} pages, ${extraction.fullText.length} characters`);

    if (extraction.pageCount > maxPages) {
      const hint = mode === "thesis"
        ? "Consider splitting very large documents or reducing appendix content."
        : "Thesis proposals should be 4-6 pages. If this is a full thesis, select the 'Thesis' review mode instead.";
      callbacks.onError(
        `PDF has ${extraction.pageCount} pages, but the maximum allowed for ${mode} mode is ${maxPages}. ${hint}`
      );
      return;
    }

    // Step 2: Render page images using the copy (original may be detached)
    let pageImages;
    try {
      console.log("[pipeline] Rendering PDF pages as images...");
      pageImages = await renderPDFPages(bufferCopy);
      console.log(`[pipeline] Rendered ${pageImages.length} page images`);
    } catch (err) {
      console.warn("[pipeline] PDF page rendering failed (image-enabled checks will use text only):", err instanceof Error ? err.message : err);
    }

    callbacks.onStep("extract", "done");

    // Step 3: Run parallel checks
    callbacks.onStep("check", "active");
    const model = createModel(provider);
    let checkGroups: CheckGroupMeta[] = getCheckGroups(mode);
    if (selectedGroups && selectedGroups.length > 0) {
      const selectedSet = new Set(selectedGroups);
      checkGroups = checkGroups.filter((g) => selectedSet.has(g.id));
    }
    const maxConcurrency = provider === "ollama" ? 2 : undefined; // undefined = all at once
    console.log(`[pipeline] Using provider: ${provider}, mode: ${mode}, checks: ${checkGroups.length}/${getCheckGroups(mode).length}, concurrency: ${maxConcurrency ?? "unlimited"}`);

    // Build prompts with guideline reference material (loaded once, cached)
    const prompts = await getCheckGroupPrompts(mode);

    // Count input tokens for all checks using tiktoken (text only).
    // NOTE: Image tokens (for groups receiving page images) are not included in this
    // estimate. The actual API token count will be higher for image-enabled groups.
    let cumulativeInputTokens = 0;
    const userMessage = `Here is the proposal text to review:\n\n${extraction.fullText}`;
    const checkInputTokens = checkGroups.reduce((sum, g) => {
      return sum + countTokens(prompts[g.id] ?? "") + countTokens(userMessage);
    }, 0);
    cumulativeInputTokens += checkInputTokens;
    callbacks.onInputEstimate(cumulativeInputTokens);

    const { results: checkResults, sentPreviousFindingIndices } = await runAllChecks({
      model,
      proposalText: extraction.fullText,
      pageImages,
      checkGroups,
      prompts,
      previousFindings: options?.previousFindings,
      previousAdjudications: options?.previousAdjudications,
      maxConcurrency,
      reviewId,
      signal: pipelineAbort.signal,
      onCheckStart: callbacks.onCheckStart,
      onCheckComplete: callbacks.onCheckComplete,
      onCheckFailed: callbacks.onCheckFailed,
      onCheckTokens: callbacks.onCheckTokens,
      onCheckThinking: callbacks.onCheckThinking,
    });

    callbacks.onStep("check", "done");

    // Collect failed group info for partial results indicator
    const failedResults = checkResults.filter((r) => r.error);
    const failedGroups: FailedGroupInfo[] = failedResults.map((r) => ({
      groupId: r.groupId,
      label: ALL_CHECK_GROUP_META[r.groupId]?.label ?? r.groupId,
      error: r.error!,
    }));
    const successCount = checkResults.length - failedResults.length;

    // If ALL groups failed, skip the merge and report an error
    if (successCount === 0) {
      const groupNames = failedGroups.map((g) => g.label).join(", ");
      callbacks.onError(
        `All check groups failed: ${groupNames}. Please try again later.`
      );
      return;
    }

    // Step 3.5: Build revision context for the merger (if reviewing a revised document)
    const isRevision = options?.previousFindings && options.previousFindings.length > 0 && options.previousReviewId;
    let revisionContext: MergerRevisionContext | undefined;

    if (isRevision) {
      const prevFindings = options!.previousFindings!;
      const previousReviewId = options!.previousReviewId!;

      // Aggregate resolvedPreviousFindings from all check groups, deduped by index.
      // If multiple groups report the same index as resolved, keep the first one.
      // Apply conflict resolution: if any successful group maps a current finding to a
      // previous finding (via matchedPreviousFindingIndices), it stays persistent
      // regardless of resolution reports from other groups.
      // Special case: if a finding was dismissed by the user, don't auto-add to persistent.
      // If the LLM still flags a dismissed finding, mark it as conflicted.
      const adjudications = options!.previousAdjudications;
      const persistentIndices = new Set<number>();
      const conflictedIndices = new Set<number>();
      for (const cr of checkResults) {
        if (cr.error) continue; // skip failed groups
        for (const f of cr.findings) {
          // Any finding with matched previous indices is persistence evidence,
          // regardless of whether previouslyFlagged is also set.
          if (f.matchedPreviousFindingIndices?.length) {
            for (const idx of f.matchedPreviousFindingIndices) {
              // Bounds check
              if (idx >= 0 && idx < prevFindings.length) {
                const adj = adjudications?.get(idx);
                if (adj?.annotationStatus === "dismissed") {
                  // User dismissed this finding — if LLM re-flags it, mark conflicted
                  // but still add to persistent (LLM evidence overrides user dismissal)
                  console.log(`[pipeline] Conflict: index ${idx} was dismissed by user but re-flagged by LLM — marking conflicted`);
                  conflictedIndices.add(idx);
                }
                persistentIndices.add(idx);
              } else {
                console.warn(`[pipeline] matchedPreviousFindingIndex ${idx} out of range (${prevFindings.length}), ignoring`);
              }
            }
          }
        }
      }

      const resolutionsByIndex = new Map<number, ResolvedPreviousFinding>();
      for (const cr of checkResults) {
        if (cr.error || !cr.resolvedPreviousFindings) continue;
        for (const rpf of cr.resolvedPreviousFindings) {
          // Validate index is in range
          if (rpf.previousFindingIndex < 0 || rpf.previousFindingIndex >= prevFindings.length) {
            console.warn(`[pipeline] resolvedPreviousFinding index ${rpf.previousFindingIndex} out of range (${prevFindings.length}), skipping`);
            continue;
          }
          // Validate title matches (log warning on mismatch)
          const expectedTitle = prevFindings[rpf.previousFindingIndex].title;
          if (rpf.title !== expectedTitle) {
            console.warn(`[pipeline] resolvedPreviousFinding title mismatch at index ${rpf.previousFindingIndex}: expected "${expectedTitle}", got "${rpf.title}"`);
          }
          // Conflict resolution: persistent wins over resolved
          if (persistentIndices.has(rpf.previousFindingIndex)) {
            console.log(`[pipeline] Conflict: index ${rpf.previousFindingIndex} reported as both resolved and persistent — marking persistent (conflicted)`);
            conflictedIndices.add(rpf.previousFindingIndex);
            continue; // skip this resolution
          }
          // Dedupe by index (keep first)
          if (!resolutionsByIndex.has(rpf.previousFindingIndex)) {
            resolutionsByIndex.set(rpf.previousFindingIndex, {
              ...rpf,
              reasoning: rpf.reasoning.slice(0, 200),
            });
          }
        }
      }

      // Token trimming: if total serialized resolution reports > budget, drop lowest-severity first
      const aggregatedResolutions = [...resolutionsByIndex.values()];
      if (JSON.stringify(aggregatedResolutions).length > MAX_RESOLUTION_REPORT_CHARS) {
        const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2, suggestion: 3 };
        // Sort by previous finding severity (lowest first = drop first from end)
        aggregatedResolutions.sort((a, b) => {
          const sevA = prevFindings[a.previousFindingIndex]?.severity ?? "suggestion";
          const sevB = prevFindings[b.previousFindingIndex]?.severity ?? "suggestion";
          return (severityOrder[sevB] ?? 4) - (severityOrder[sevA] ?? 4);
        });
        // Pre-compute per-entry sizes and trim from the front (lowest severity)
        const entrySizes = aggregatedResolutions.map((r) => JSON.stringify(r).length);
        // Account for array brackets and commas: [entry1,entry2,...] = 2 + (n-1) commas
        let totalSize = 2 + entrySizes.reduce((s, v) => s + v, 0) + Math.max(0, entrySizes.length - 1);
        while (aggregatedResolutions.length > 0 && totalSize > MAX_RESOLUTION_REPORT_CHARS) {
          const removed = entrySizes.shift()!;
          aggregatedResolutions.shift();
          totalSize -= removed + (aggregatedResolutions.length > 0 ? 1 : 0); // remove entry + comma
        }
        console.log(`[pipeline] Trimmed resolution reports to ${aggregatedResolutions.length} entries to fit token budget`);
      }

      // Build successful category set from non-failed check groups
      const successfulCategories = new Set<string>();
      const CHECK_GROUP_CATEGORIES: Record<string, string[]> = {
        "structure": ["structure", "completeness"],
        "problem-motivation-objectives": ["logic", "completeness"],
        "bibliography": ["citation"],
        "figures": ["figures"],
        "writing-style": ["writing"],
        "writing-structure": ["writing", "structure"],
        "writing-formatting": ["formatting"],
        "ai-transparency": ["completeness", "other"],
        "schedule": ["completeness", "other"],
        "related-work": ["citation", "completeness"],
        "methodology": ["methodology"],
        "evaluation": ["methodology", "completeness"],
      };
      for (const cr of checkResults) {
        if (cr.error) continue;
        const cats = CHECK_GROUP_CATEGORIES[cr.groupId] ?? [];
        for (const cat of cats) {
          successfulCategories.add(cat);
        }
      }

      revisionContext = {
        previousReviewId,
        previousFindings: prevFindings,
        previousAssessment: options!.previousAssessment,
        aggregatedResolutions,
        successfulCategories,
        conflictedIndices,
        previousAdjudications: options!.previousAdjudications,
        sentPreviousFindingIndices,
      };

      console.log(`[pipeline] Revision context: ${prevFindings.length} prev findings, ${aggregatedResolutions.length} resolved, ${persistentIndices.size} persistent (by conflict), ${successfulCategories.size} categories covered`);
    }

    // Step 4: Merge results
    callbacks.onStep("merge", "active");

    // Count input tokens for the merge call using tiktoken
    const allFindings = checkResults.flatMap((r) => r.findings);
    const mergeInputStr = JSON.stringify(allFindings, null, 2);
    const mergeInputTokens = countTokens(mergeInputStr) + countTokens("You are an expert thesis proposal reviewer"); // approximate system prompt
    cumulativeInputTokens += mergeInputTokens;
    callbacks.onInputEstimate(cumulativeInputTokens);

    const { data: mergedFeedback, usage: mergeUsage } = await mergeFindings(model, checkResults, {
      signal: pipelineAbort.signal,
      onToken: callbacks.onMergeTokens,
      onThinking: callbacks.onMergeThinking,
      previousFindings: options?.previousFindings,
      previousAssessment: options?.previousAssessment,
      revisionContext,
      mode,
    });

    if (mergeUsage) {
      callbacks.onMergeUsage(mergeUsage);
    }

    callbacks.onStep("merge", "done");

    // Post-parse assertion: if this is a revision but the merger didn't produce
    // versionComparison, generate a server-side fallback from check group data.
    let versionComparison = mergedFeedback.versionComparison;

    // Validate merger-produced indices are in bounds
    if (isRevision && versionComparison && revisionContext) {
      const maxIdx = revisionContext.previousFindings.length;
      const hasInvalidIndex = [
        ...versionComparison.resolvedFindings.map((f) => f.previousFindingIndex),
        ...versionComparison.persistentFindings.map((f) => f.previousFindingIndex),
        ...versionComparison.unreviewedFindings.map((f) => f.previousFindingIndex),
      ].some((idx) => idx < 0 || idx >= maxIdx);

      if (hasInvalidIndex) {
        console.warn("[pipeline] Merger versionComparison contains out-of-bounds indices — falling back to deterministic builder");
        versionComparison = undefined;
      }
    }

    if (isRevision && !versionComparison && revisionContext) {
      console.log("[pipeline] Merger did not produce versionComparison — generating server-side fallback");
      versionComparison = buildFallbackVersionComparison(
        revisionContext,
        mergedFeedback.findings,
      );
    }

    // Step 5: Deliver results (attach failed groups info for partial results)
    const result: MergedFeedback = {
      ...(mergedFeedback as MergedFeedback),
      ...(failedGroups.length > 0 ? { failedGroups } : {}),
      ...(versionComparison ? { versionComparison: versionComparison as VersionComparison } : {}),
    };
    callbacks.onResult(result);
  } catch (error) {
    if (pipelineAbort.signal.aborted) {
      console.error("[pipeline] Review timed out after 15 minutes");
      try { callbacks.onError("Review timed out after 15 minutes"); } catch { /* writer may be dead */ }
      return;
    }
    console.error("[pipeline] Fatal error:", error instanceof Error ? error.message : error);
    try {
      callbacks.onError(error instanceof Error ? error.message : "An unknown error occurred");
    } catch { /* writer may be dead */ }
  } finally {
    clearTimeout(pipelineTimeout);
  }
}

/**
 * Build a deterministic fallback versionComparison from check group data
 * when the merger LLM doesn't produce one.
 */
function buildFallbackVersionComparison(
  revCtx: MergerRevisionContext,
  mergedFindings: Finding[],
): VersionComparison {
  const prevFindings = revCtx.previousFindings;
  const resolvedIndices = new Set(revCtx.aggregatedResolutions.map((r) => r.previousFindingIndex));

  // Persistent = current findings that reference previous findings via matchedPreviousFindingIndices
  const persistentIndices = new Set<number>();
  const persistentFindings: VersionComparison["persistentFindings"] = [];
  for (const f of mergedFindings) {
    if (f.matchedPreviousFindingIndices) {
      for (const idx of f.matchedPreviousFindingIndices) {
        if (idx >= 0 && idx < prevFindings.length && !persistentIndices.has(idx)) {
          persistentIndices.add(idx);
          // Check if any group also reported it resolved (conflict), or if it was
          // already flagged as conflicted during pipeline aggregation
          const conflicted = resolvedIndices.has(idx) || (revCtx.conflictedIndices?.has(idx) ?? false);
          if (resolvedIndices.has(idx)) resolvedIndices.delete(idx); // persistent wins
          persistentFindings.push({
            previousFindingIndex: idx,
            previousTitle: prevFindings[idx].title,
            currentTitle: f.title,
            severity: prevFindings[idx].severity,
            category: normalizeFindingCategory(prevFindings[idx].category),
            ...(conflicted ? { conflicted: true } : {}),
          });
        }
      }
    }
  }

  // Resolved = from aggregated resolutions (minus any that became persistent via conflict)
  const resolvedFindings: VersionComparison["resolvedFindings"] = revCtx.aggregatedResolutions
    .filter((r) => resolvedIndices.has(r.previousFindingIndex))
    .map((r) => ({
      previousFindingIndex: r.previousFindingIndex,
      title: r.title,
      severity: prevFindings[r.previousFindingIndex].severity,
      category: normalizeFindingCategory(prevFindings[r.previousFindingIndex].category),
      reasoning: r.reasoning,
    }));

  // Unreviewed = previous findings not resolved, not persistent, and either:
  // 1. In categories not covered by successful check groups (group failed)
  // 2. In covered categories but not sent (truncated by per-group cap)
  const accountedFor = new Set([...resolvedIndices, ...persistentIndices]);
  const unreviewedFindings: VersionComparison["unreviewedFindings"] = [];
  for (let i = 0; i < prevFindings.length; i++) {
    if (accountedFor.has(i)) continue;
    const cat = normalizeFindingCategory(prevFindings[i].category);
    if (!revCtx.successfulCategories.has(cat)) {
      // Category not covered — check group failed
      unreviewedFindings.push({
        previousFindingIndex: i,
        title: prevFindings[i].title,
        severity: prevFindings[i].severity,
        category: cat,
        reason: `Check group covering "${cat}" category failed`,
      });
      accountedFor.add(i);
    } else if (revCtx.sentPreviousFindingIndices && !revCtx.sentPreviousFindingIndices.has(i)) {
      // Category covered but this finding was truncated (exceeded per-group cap)
      unreviewedFindings.push({
        previousFindingIndex: i,
        title: prevFindings[i].title,
        severity: prevFindings[i].severity,
        category: cat,
        reason: "Exceeded per-group context limit",
      });
      accountedFor.add(i);
    }
  }

  // Remaining unaccounted previous findings → treat as resolved with generic reasoning
  // (the check group reviewed the category AND was sent this finding but didn't flag it as persistent)
  for (let i = 0; i < prevFindings.length; i++) {
    if (accountedFor.has(i)) continue;
    resolvedFindings.push({
      previousFindingIndex: i,
      title: prevFindings[i].title,
      severity: prevFindings[i].severity,
      category: normalizeFindingCategory(prevFindings[i].category),
      reasoning: "Not flagged by any check group in the new version",
    });
  }

  // New = current findings with no matchedPreviousFindingIndices
  const newFindings: VersionComparison["newFindings"] = mergedFindings
    .filter((f) => !f.matchedPreviousFindingIndices || f.matchedPreviousFindingIndices.length === 0)
    .filter((f) => !f.previouslyFlagged) // extra safety: if previouslyFlagged but no indices, don't count as new
    .map((f) => ({
      title: f.title,
      severity: f.severity,
      category: normalizeFindingCategory(f.category),
    }));

  return {
    previousReviewId: revCtx.previousReviewId,
    resolvedFindings,
    persistentFindings,
    unreviewedFindings,
    newFindings,
    improvementSummary: `${resolvedFindings.length} issue(s) resolved, ${persistentFindings.length} persistent, ${newFindings.length} new issue(s) found.`,
  };
}
