import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ProviderType } from "@/types/review";

// The OpenAI SDK underneath ChatOpenAI defaults to a 10-minute per-request
// timeout (DEFAULT_TIMEOUT = 600000). gpt-oss with reasoning_effort=high can
// exceed that on long inputs, especially while logos serializes parallel
// requests. Bump to 30 minutes to match the pipeline-level abort.
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

export function createModel(provider: ProviderType): BaseChatModel {
  if (provider === "azure") {
    // Use ChatOpenAI directly with Azure v1 API endpoint
    return new ChatOpenAI({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      streaming: true,
      useResponsesApi: true,
      reasoning: { effort: "high", summary: "auto" },
      timeout: REQUEST_TIMEOUT_MS,
      configuration: {
        baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/v1`,
        defaultHeaders: {
          "api-key": process.env.AZURE_OPENAI_API_KEY!,
        },
        defaultQuery: {
          "api-version": "preview",
        },
      },
    });
  }

  // Self-hosted open-source model on TUM AET infrastructure (OpenAI-compatible gateway).
  // __includeRawResponse: LangChain's chunk converter only copies `delta.reasoning_content`
  // (OpenAI o-series) into additional_kwargs, but vLLM/gpt-oss emits `delta.reasoning`.
  // This flag attaches the full raw chunk so we can read `reasoning` ourselves.
  // OpenAI-recommended inference settings for gpt-oss: temperature=1.0,
  // top_p=1.0, top_k=0. top_k is a vLLM-specific extension (not part of the
  // standard OpenAI Chat Completions schema), so it goes via modelKwargs.
  return new ChatOpenAI({
    apiKey: process.env.LOCAL_LLM_API_KEY,
    model: process.env.LOCAL_LLM_MODEL || "openai/gpt-oss-120b",
    temperature: 1.0,
    topP: 1.0,
    streaming: true,
    modelKwargs: { reasoning_effort: "high", top_k: 0 },
    __includeRawResponse: true,
    timeout: REQUEST_TIMEOUT_MS,
    configuration: {
      baseURL: process.env.LOCAL_LLM_BASE_URL || "https://logos.aet.cit.tum.de/v1",
    },
  } as ConstructorParameters<typeof ChatOpenAI>[0]);
}
