import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ProviderType } from "@/types/review";

// TODO: Validate OLLAMA_BASE_URL against allowlist for public deployment (P1-4)
export function createModel(provider: ProviderType): BaseChatModel {
  if (provider === "azure") {
    // Use ChatOpenAI directly with Azure v1 API endpoint
    return new ChatOpenAI({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2",
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

  // Ollama remote — OpenAI-compatible with API key
  return new ChatOpenAI({
    apiKey: process.env.OLLAMA_API_KEY,
    model: process.env.OLLAMA_MODEL || "gpt-oss:120b",
    temperature: 0.2,
    streaming: true,
    modelKwargs: { think: "high" },
    configuration: {
      baseURL: process.env.OLLAMA_BASE_URL || "https://gpu.aet.cit.tum.de/ollama/v1",
    },
  });
}
