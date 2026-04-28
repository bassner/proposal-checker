import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ProviderType } from "@/types/review";

export function createModel(provider: ProviderType): BaseChatModel {
  if (provider === "azure") {
    // Use ChatOpenAI directly with Azure v1 API endpoint
    return new ChatOpenAI({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      streaming: true,
      useResponsesApi: true,
      reasoning: { effort: "high", summary: "auto" },
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
  return new ChatOpenAI({
    apiKey: process.env.LOCAL_LLM_API_KEY,
    model: process.env.LOCAL_LLM_MODEL || "openai/gpt-oss-120b",
    temperature: 0.2,
    streaming: true,
    modelKwargs: { reasoning_effort: "high" },
    configuration: {
      baseURL: process.env.LOCAL_LLM_BASE_URL || "https://logos.aet.cit.tum.de/v1",
    },
  });
}
