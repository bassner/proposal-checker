import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ProviderType } from "@/types/review";
import { cloudReasoningEffort, getProviderConfig } from "./provider-config";

// The OpenAI SDK underneath ChatOpenAI defaults to a 10-minute per-request
// timeout (DEFAULT_TIMEOUT = 600000). Open-weight models with high reasoning
// effort can exceed that on long inputs, especially while logos serializes
// parallel requests. Bump to 30 minutes to match the pipeline-level abort.
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Sampling and reasoning settings per open-weight model family.
 * - Qwen3.8 (27B, Flash Next): model-card thinking-mode values. Thinking is
 *   requested explicitly because Logos serves Qwen without thinking by default.
 * - gpt-oss: OpenAI-recommended settings (temperature=1.0, top_p=1.0, top_k=0).
 * top_k, min_p and chat_template_kwargs are vLLM extensions (not part of the
 * standard Chat Completions schema), so they go via modelKwargs.
 * `reasoning_effort` must stay in modelKwargs: structured-invoke uses it to skip
 * native structured output for reasoning models.
 */
function openWeightSampling(model: string): {
  temperature: number;
  topP: number;
  modelKwargs: Record<string, unknown>;
} {
  if (/qwen/i.test(model)) {
    return {
      temperature: 1.0,
      topP: 0.95,
      modelKwargs: {
        reasoning_effort: "xhigh",
        top_k: 20,
        min_p: 0,
        chat_template_kwargs: { enable_thinking: true },
      },
    };
  }
  return {
    temperature: 1.0,
    topP: 1.0,
    modelKwargs: { reasoning_effort: "high", top_k: 0 },
  };
}

export function createModel(provider: ProviderType, model?: string): BaseChatModel {
  if (provider === "cloud") {
    const config = getProviderConfig(provider, process.env, { model });
    const reasoningEffort = cloudReasoningEffort(config.model);
    console.log(`[llm] Creating cloud model ${config.model} with reasoning effort ${reasoningEffort}`);
    return new ChatOpenAI({
      model: config.model,
      apiKey: config.apiKey,
      streaming: true,
      useResponsesApi: true,
      reasoning: {
        // The deployed API supports `max`; the installed LangChain
        // ReasoningEffort union has not added that value yet.
        effort: reasoningEffort as "high",
        summary: "auto",
      },
      timeout: REQUEST_TIMEOUT_MS,
      configuration: {
        baseURL: config.baseURL,
        // Azure OpenAI hosts authenticate with `api-key` and need `api-version`;
        // OpenAI-compatible gateways (Logos) use the SDK's Bearer header only.
        ...(config.azureApiVersion && {
          defaultHeaders: { "api-key": config.apiKey },
          defaultQuery: { "api-version": config.azureApiVersion },
        }),
      },
    });
  }

  const config = getProviderConfig(provider);
  const sampling = openWeightSampling(config.model);
  console.log(`[llm] Creating ${provider} model ${config.model}`);

  // Self-hosted open-weight model on TUM infrastructure (OpenAI-compatible gateway).
  // __includeRawResponse: LangChain's chunk converter only copies `delta.reasoning_content`
  // (OpenAI o-series) into additional_kwargs, but vLLM emits `delta.reasoning`.
  // This flag attaches the full raw chunk so we can read `reasoning` ourselves.
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: sampling.temperature,
    topP: sampling.topP,
    streaming: true,
    modelKwargs: sampling.modelKwargs,
    __includeRawResponse: true,
    timeout: REQUEST_TIMEOUT_MS,
    configuration: {
      baseURL: config.baseURL,
    },
  } as ConstructorParameters<typeof ChatOpenAI>[0]);
}
