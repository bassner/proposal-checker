// Note: The `as any` casts below access LangChain internal properties
// (useResponsesApi, modelKwargs, additional_kwargs, usage_metadata).
// Tested with @langchain/openai ^1.2.7 and @langchain/core ^1.1.22.
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageLike } from "@langchain/core/messages";
import type { z } from "zod";
import type { LLMPhase } from "@/types/review";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface StructuredInvokeResult<T> {
  data: T;
  usage: TokenUsage | null;
}

export interface StructuredInvokeOptions {
  signal?: AbortSignal;
  onToken?: (count: number, phase: LLMPhase) => void;
  onThinking?: (text: string) => void;
}

/**
 * Safely invoke a model with structured output.
 *
 * Strategy:
 * 1. Try withStructuredOutput() (works with Azure/OpenAI natively)
 * 2. If that fails (e.g. thinking models), fall back to prompt-based JSON extraction
 * 3. Parse and validate with Zod schema
 * 4. One retry on parse failure
 *
 * Returns both the parsed data and actual token usage from the API response.
 */
export async function safeStructuredInvoke<T extends z.ZodTypeAny>(
  model: BaseChatModel,
  messages: BaseMessageLike[],
  schema: T,
  options?: StructuredInvokeOptions
): Promise<StructuredInvokeResult<z.infer<T>>> {
  let tokenCount = 0;
  let capturedUsage: TokenUsage | null = null;

  const callbackHandlers: Record<string, (...args: unknown[]) => void> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleLLMEnd(output: any) {
      // Prefer usage_metadata from the AIMessage (has full details incl. reasoning tokens)
      const msg = output?.generations?.[0]?.[0]?.message;
      const usageMeta = msg?.usage_metadata;
      if (usageMeta) {
        capturedUsage = {
          inputTokens: usageMeta.input_tokens ?? 0,
          outputTokens: usageMeta.output_tokens ?? 0,
          reasoningTokens: usageMeta.output_token_details?.reasoning ?? 0,
        };
      } else {
        // Fallback to basic tokenUsage (no reasoning detail)
        const tokenUsage = output?.llmOutput?.tokenUsage;
        if (tokenUsage) {
          capturedUsage = {
            inputTokens: tokenUsage.promptTokens ?? 0,
            outputTokens: tokenUsage.completionTokens ?? 0,
            reasoningTokens: 0,
          };
        }
      }
    },
  };

  if (options?.onToken) {
    // Track <think> tags for Ollama-style thinking models.
    // The model streams <think>...</think> as regular content before the JSON.
    let accumulated = "";
    let thinkTagClosed = false;

    callbackHandlers.handleLLMNewToken = (token: unknown) => {
      tokenCount++;
      const text = typeof token === "string" ? token : "";
      accumulated += text;

      if (!thinkTagClosed && accumulated.includes("<think>")) {
        if (accumulated.includes("</think>")) {
          thinkTagClosed = true;
          options.onToken!(tokenCount, "generating");
        } else {
          // Still inside <think> block
          if (options.onThinking) {
            const cleaned = accumulated.replace(/<think>/g, "").trim();
            if (cleaned) options.onThinking(cleaned);
          }
          options.onToken!(tokenCount, "thinking");
        }
      } else {
        // No <think> tags (OpenAI tool-call path) or past </think>
        options.onToken!(tokenCount, thinkTagClosed ? "generating" : "generating");
      }
    };
  }

  const callbacks = [callbackHandlers];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usesResponsesApi = !!(model as any).useResponsesApi;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usesThinkTags = !!(model as any).modelKwargs?.think;

  // Attempt 1: Native structured output
  // Skip for Responses API (discards reasoning summary chunks) and
  // for <think>-tag models (callback receives empty strings, can't detect thinking phase)
  if (!usesResponsesApi && !usesThinkTags) {
    try {
      const structured = model.withStructuredOutput(schema);
      const result = await structured.invoke(messages, {
        signal: options?.signal,
        callbacks,
      });
      return { data: result, usage: capturedUsage };
    } catch {
      // Native structured output failed — fall back to prompt-based approach
      console.log("[structured-invoke] withStructuredOutput failed, falling back to prompt-based JSON extraction");
    }
  } else {
    console.log("[structured-invoke] Using streaming path for reasoning summaries");
  }

  // Attempt 2: Prompt-based JSON extraction with streaming
  tokenCount = 0;
  capturedUsage = null;
  const jsonInstructions = buildJsonInstructions(schema);
  const augmentedMessages = appendJsonInstructions(messages, jsonInstructions);

  const { text: rawText, usage: streamUsage } = await streamCollect(model, augmentedMessages, options);
  capturedUsage = streamUsage;

  const parsed = tryParseJson(rawText, schema);
  if (parsed.success) {
    return { data: parsed.data, usage: capturedUsage };
  }

  // Attempt 3: One retry asking the model to fix the JSON
  console.log("[structured-invoke] JSON parse failed, retrying with fix prompt. Raw text starts with:", rawText.slice(0, 200));
  const cleanedForRetry = rawText
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<think>[\s\S]*/g, "")
    .replace(/<thinking>[\s\S]*/g, "")
    .trim();
  const retryMessages: BaseMessageLike[] = [
    ...augmentedMessages,
    ["assistant", cleanedForRetry],
    [
      "user",
      `The JSON you provided was invalid. Error: ${parsed.error}\n\nPlease output ONLY valid JSON matching the schema. No markdown fences, no extra text.`,
    ],
  ];

  const { text: retryText, usage: retryUsage } = await streamCollect(model, retryMessages, options);
  const retryParsed = tryParseJson(retryText, schema);
  if (retryParsed.success) {
    // Combine usage from both attempts
    const combinedUsage: TokenUsage | null = capturedUsage && retryUsage
      ? { inputTokens: capturedUsage.inputTokens + retryUsage.inputTokens, outputTokens: capturedUsage.outputTokens + retryUsage.outputTokens, reasoningTokens: capturedUsage.reasoningTokens + retryUsage.reasoningTokens }
      : retryUsage ?? capturedUsage;
    return { data: retryParsed.data, usage: combinedUsage };
  }

  throw new Error(
    `Failed to get valid structured output after retry: ${retryParsed.error}`
  );
}

interface StreamResult {
  text: string;
  usage: TokenUsage | null;
}

async function streamCollect(
  model: BaseChatModel,
  messages: BaseMessageLike[],
  options?: StructuredInvokeOptions
): Promise<StreamResult> {
  let tokenCount = 0;
  let fullText = "";
  let thinkingText = "";
  let seenContent = false;
  let usage: TokenUsage | null = null;

  const stream = await model.stream(messages, { signal: options?.signal });
  for await (const chunk of stream) {
    // Reasoning summary chunks (Responses API thinking phase)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reasoning = (chunk as any).additional_kwargs?.reasoning;
    if (reasoning?.summary && options?.onThinking) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta = reasoning.summary.map((s: any) => s.text).join("");
      if (delta) {
        thinkingText += delta;
        // Send the full accumulated summary so the client can just replace
        options.onThinking(thinkingText);
      }
    }

    // Content chunk (generating phase)
    // Responses API returns content as arrays of content blocks, not plain strings
    let content = "";
    if (typeof chunk.content === "string") {
      content = chunk.content;
    } else if (Array.isArray(chunk.content)) {
      content = chunk.content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b.type === "text" || b.type === "output_text")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => b.text ?? "")
        .join("");
    }
    fullText += content;
    tokenCount++;

    // Phase detection:
    // - Responses API: reasoning summary chunks = thinking, content = generating
    // - Ollama <think> tags: inside <think>...</think> = thinking, after = generating
    // - Plain models: any content = generating
    let phase: LLMPhase = "thinking";
    if (!seenContent && content.length > 0) {
      if (fullText.includes("<think>") && !fullText.includes("</think>")) {
        // Inside <think> block — send thinking text via onThinking
        if (options?.onThinking && !thinkingText) {
          // Only use this path if we haven't gotten Responses API thinking
          const cleaned = fullText.replace(/<think>/g, "").trim();
          if (cleaned) options.onThinking(cleaned);
        }
      } else if (fullText.includes("</think>")) {
        // Just closed think block, or content after it
        const afterThink = fullText.slice(fullText.indexOf("</think>") + "</think>".length).trim();
        if (afterThink.length > 0) seenContent = true;
        // Send final thinking text
        if (options?.onThinking && !thinkingText) {
          const start = fullText.indexOf("<think>") + "<think>".length;
          const end = fullText.indexOf("</think>");
          const cleaned = fullText.slice(start, end).trim();
          if (cleaned) options.onThinking(cleaned);
        }
      } else {
        // No think tags at all
        seenContent = true;
      }
    }
    phase = seenContent ? "generating" : "thinking";
    options?.onToken?.(tokenCount, phase);

    // Capture usage_metadata from the final chunk (LangChain includes it when streamUsage is true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (chunk as any).usage_metadata;
    if (meta) {
      usage = {
        inputTokens: meta.input_tokens ?? 0,
        outputTokens: meta.output_tokens ?? 0,
        reasoningTokens: meta.output_token_details?.reasoning ?? 0,
      };
    }
  }

  return { text: fullText, usage };
}

function buildJsonInstructions(schema: z.ZodTypeAny): string {
  const shape = zodToJsonDescription(schema);
  return `\n\nIMPORTANT: You MUST respond with ONLY a valid JSON object (no markdown fences, no extra text, no thinking tags). The JSON must match this exact schema:\n${shape}`;
}

function appendJsonInstructions(
  messages: BaseMessageLike[],
  instructions: string
): BaseMessageLike[] {
  const copy = [...messages];
  const last = copy[copy.length - 1];
  if (Array.isArray(last) && last[0] === "user") {
    copy[copy.length - 1] = ["user", last[1] + instructions];
  } else {
    copy.push(["user", instructions]);
  }
  return copy;
}

function tryParseJson<T extends z.ZodTypeAny>(
  text: string,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  let cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    // Handle unclosed think tags (model didn't close the tag)
    .replace(/<think>[\s\S]*/g, "")
    .replace(/<thinking>[\s\S]*/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.message };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "JSON parse failed",
    };
  }
}

function zodToJsonDescription(schema: z.ZodTypeAny): string {
  try {
    const jsonSchema = zodToSimpleSchema(schema);
    return JSON.stringify(jsonSchema, null, 2);
  } catch {
    return '{ "findings": [{ "severity": "critical|major|minor|suggestion", "category": "string", "title": "string", "description": "string", "locations": [{ "page": "number|null", "section": "string|null", "quote": "string" }] }] }';
  }
}

function zodToSimpleSchema(schema: z.ZodTypeAny): unknown {
  const def = schema._def;

  if (def.typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      result[key] = zodToSimpleSchema(value as z.ZodTypeAny);
    }
    return result;
  }

  if (def.typeName === "ZodArray") {
    return [zodToSimpleSchema(def.type)];
  }

  if (def.typeName === "ZodEnum") {
    return def.values.join("|");
  }

  if (def.typeName === "ZodOptional") {
    return zodToSimpleSchema(def.innerType) + " (optional)";
  }

  if (def.typeName === "ZodNullable") {
    return zodToSimpleSchema(def.innerType) + " | null";
  }

  if (def.typeName === "ZodString") {
    return "string";
  }

  if (def.typeName === "ZodNumber") {
    return "number";
  }

  return "unknown";
}
