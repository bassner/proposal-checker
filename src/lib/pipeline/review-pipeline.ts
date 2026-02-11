import type { ProviderType } from "@/types/review";
import type { CheckGroupId, LLMPhase, MergedFeedback } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { createModel } from "@/lib/llm/provider";
import { extractPDFText } from "@/lib/pdf/extract";
import { renderPDFPages } from "@/lib/pdf/render";
import { runAllChecks } from "@/lib/llm/parallel-runner";
import { mergeFindings } from "@/lib/llm/merger";
import { CHECK_GROUP_PROMPTS } from "@/lib/llm/prompts";
import { CHECK_GROUPS } from "@/types/review";
import { countTokens } from "@/lib/utils";

export interface PipelineCallbacks {
  onStep: (step: string, status: string) => void;
  onCheckStart: (groupId: CheckGroupId) => void;
  onCheckComplete: (groupId: CheckGroupId, findingCount: number, usage: TokenUsage | null) => void;
  onCheckFailed: (groupId: CheckGroupId, error: string) => void;
  onCheckTokens: (groupId: CheckGroupId, tokens: number, phase: LLMPhase) => void;
  onCheckThinking: (groupId: CheckGroupId, text: string) => void;
  onMergeTokens: (tokens: number, phase: LLMPhase) => void;
  onMergeThinking: (text: string) => void;
  onMergeUsage: (usage: TokenUsage) => void;
  onInputEstimate: (tokens: number) => void;
  onResult: (feedback: MergedFeedback) => void;
  onError: (error: string) => void;
}

export async function runReviewPipeline(
  pdfBuffer: ArrayBuffer,
  provider: ProviderType,
  callbacks: PipelineCallbacks
): Promise<void> {
  const maxPages = parseInt(process.env.MAX_PDF_PAGES || "20", 10);

  try {
    // Copy buffer upfront — unpdf can detach the original ArrayBuffer
    const bufferCopy = pdfBuffer.slice(0);

    // Step 1: Extract text
    callbacks.onStep("extract", "active");
    console.log(`[pipeline] Extracting text from PDF (${(pdfBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    const extraction = await extractPDFText(pdfBuffer);
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
      console.warn("[pipeline] PDF page rendering failed (figures check will use text only):", err instanceof Error ? err.message : err);
    }

    callbacks.onStep("extract", "done");

    // Step 3: Run 7 parallel checks
    callbacks.onStep("check", "active");
    const model = createModel(provider);
    const maxConcurrency = provider === "ollama" ? 2 : undefined; // undefined = all at once
    console.log(`[pipeline] Using provider: ${provider}, concurrency: ${maxConcurrency ?? "unlimited"}`);

    // Count input tokens for all 7 checks using tiktoken (exact same tokenizer as the model)
    const userMessage = `Here is the proposal text to review:\n\n${extraction.fullText}`;
    const checkInputTokens = CHECK_GROUPS.reduce((sum, g) => {
      return sum + countTokens(CHECK_GROUP_PROMPTS[g.id]) + countTokens(userMessage);
    }, 0);
    callbacks.onInputEstimate(checkInputTokens);

    const checkResults = await runAllChecks({
      model,
      proposalText: extraction.fullText,
      pageImages,
      maxConcurrency,
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
    callbacks.onInputEstimate(mergeInputTokens);

    const { data: mergedFeedback, usage: mergeUsage } = await mergeFindings(model, checkResults, {
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
    console.error("[pipeline] Fatal error:", error instanceof Error ? error.message : error);
    callbacks.onError(
      error instanceof Error ? error.message : "An unknown error occurred"
    );
  }
}
