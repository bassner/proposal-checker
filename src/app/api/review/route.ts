import { NextRequest } from "next/server";
import type { ProviderType, CheckGroupId, LLMPhase } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { runReviewPipeline } from "@/lib/pipeline/review-pipeline";

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const provider = (formData.get("provider") as ProviderType) || "azure";

  if (!file) {
    return new Response(JSON.stringify({ error: "No file provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (file.type !== "application/pdf") {
    return new Response(
      JSON.stringify({ error: "Only PDF files are accepted" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const maxSizeMB = parseInt(process.env.MAX_PDF_SIZE_MB || "10", 10);
  if (file.size > maxSizeMB * 1024 * 1024) {
    return new Response(
      JSON.stringify({
        error: `File too large. Maximum size is ${maxSizeMB}MB.`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[api] Review request: ${file.name} (${(file.size / 1024).toFixed(1)} KB), provider: ${provider}`);

  const pdfBuffer = await file.arrayBuffer();

  // Throttle state for token events: only send every 200ms per source
  const lastTokenSend: Record<string, number> = {};
  const TOKEN_THROTTLE_MS = 200;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        } catch {
          closed = true;
        }
      }

      function sendThrottled(key: string, event: string, data: unknown) {
        const now = Date.now();
        if (now - (lastTokenSend[key] || 0) < TOKEN_THROTTLE_MS) return;
        lastTokenSend[key] = now;
        send(event, data);
      }

      send("step", { step: "upload", status: "done" });

      runReviewPipeline(pdfBuffer, provider, {
        onStep: (step: string, status: string) => {
          send("step", { step, status });
        },
        onCheckStart: (groupId: CheckGroupId) => {
          send("check-start", { groupId });
        },
        onCheckComplete: (groupId: CheckGroupId, findingCount: number, usage: TokenUsage | null) => {
          send("check-complete", { groupId, findingCount, ...(usage && { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens }) });
        },
        onCheckFailed: (groupId: CheckGroupId, error: string) => {
          send("check-failed", { groupId, error });
        },
        onCheckTokens: (groupId: CheckGroupId, tokens: number, phase: LLMPhase) => {
          sendThrottled(`check:${groupId}`, "check-tokens", { groupId, tokens, phase });
        },
        onCheckThinking: (groupId: CheckGroupId, text: string) => {
          sendThrottled(`check-thinking:${groupId}`, "check-thinking", { groupId, text });
        },
        onMergeTokens: (tokens: number, phase: LLMPhase) => {
          sendThrottled("merge", "merge-tokens", { tokens, phase });
        },
        onMergeThinking: (text: string) => {
          sendThrottled("merge-thinking", "merge-thinking", { text });
        },
        onMergeUsage: (usage: TokenUsage) => {
          send("merge-usage", { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens });
        },
        onInputEstimate: (tokens: number) => {
          send("input-estimate", { tokens });
        },
        onResult: (feedback) => {
          send("result", { feedback });
          send("done", {});
          if (!closed) {
            try {
              controller.close();
            } catch { /* already closed */ }
            closed = true;
          }
        },
        onError: (error: string) => {
          send("error", { error });
          if (!closed) {
            try {
              controller.close();
            } catch { /* already closed */ }
            closed = true;
          }
        },
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
