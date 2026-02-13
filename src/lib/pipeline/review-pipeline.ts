import type { ProviderType } from "@/types/review";
import type { CheckGroupId, LLMPhase, MergedFeedback } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { createModel } from "@/lib/llm/provider";
import { extractPDFText } from "@/lib/pdf/extract";
import { renderPDFPages } from "@/lib/pdf/render";
import { runAllChecks } from "@/lib/llm/parallel-runner";
import { mergeFindings } from "@/lib/llm/merger";
import { getCheckGroupPrompts } from "@/lib/llm/prompts";
import { CHECK_GROUPS } from "@/types/review";
import { countTokens } from "@/lib/llm/tokens";

const PIPELINE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

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
  callbacks: PipelineCallbacks
): Promise<void> {
  const maxPages = parseInt(process.env.MAX_PDF_PAGES || "20", 10);

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
      callbacks.onError(
        `PDF has ${extraction.pageCount} pages, but the maximum allowed is ${maxPages}. Thesis proposals should be 4-6 pages.`
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
    const maxConcurrency = provider === "ollama" ? 2 : undefined; // undefined = all at once
    console.log(`[pipeline] Using provider: ${provider}, concurrency: ${maxConcurrency ?? "unlimited"}`);

    // Build prompts with guideline reference material (loaded once, cached)
    const prompts = await getCheckGroupPrompts();

    // Count input tokens for all checks using tiktoken (text only).
    // NOTE: Image tokens (for groups receiving page images) are not included in this
    // estimate. The actual API token count will be higher for image-enabled groups.
    let cumulativeInputTokens = 0;
    const userMessage = `Here is the proposal text to review:\n\n${extraction.fullText}`;
    const checkInputTokens = CHECK_GROUPS.reduce((sum, g) => {
      return sum + countTokens(prompts[g.id]) + countTokens(userMessage);
    }, 0);
    cumulativeInputTokens += checkInputTokens;
    callbacks.onInputEstimate(cumulativeInputTokens);

    const checkResults = await runAllChecks({
      model,
      proposalText: extraction.fullText,
      pageImages,
      prompts,
      maxConcurrency,
      signal: pipelineAbort.signal,
      onCheckStart: callbacks.onCheckStart,
      onCheckComplete: callbacks.onCheckComplete,
      onCheckFailed: callbacks.onCheckFailed,
      onCheckTokens: callbacks.onCheckTokens,
      onCheckThinking: callbacks.onCheckThinking,
    });

    callbacks.onStep("check", "done");

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
    });

    if (mergeUsage) {
      callbacks.onMergeUsage(mergeUsage);
    }

    callbacks.onStep("merge", "done");

    // Step 5: Deliver results
    callbacks.onResult(mergedFeedback as MergedFeedback);
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
