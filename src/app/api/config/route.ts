import { requireAuth } from "@/lib/auth/helpers";
import { getAllowedProviders } from "@/lib/auth/provider-access";
import {
  getProviderConfig,
  ProviderConfigurationError,
} from "@/lib/llm/provider-config";

export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const { providers: allowedProviders, status } = await getAllowedProviders(session.user.role);
  if (status === "unavailable") {
    return Response.json({
      models: [],
      configStatus: "unavailable"
    }, { status: 503 });
  }
  const models = [];

  for (const provider of allowedProviders) {
    try {
      const config = getProviderConfig(provider, process.env, {
        role: session.user.role,
      });
      models.push({
        provider,
        label: provider === "azure"
          ? `Azure OpenAI (${config.model})`
          : `Local LLM (${formatModelLabel(config.model)})`,
        model: config.model,
      });
    } catch (error) {
      if (error instanceof ProviderConfigurationError) {
        console.error(`[config] ${provider} provider unavailable: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  return Response.json(
    { models, ...(models.length === 0 && { configStatus: "unavailable" }) },
    { status: models.length === 0 ? 503 : 200 }
  );
}

/** Strip provider prefix and normalize a model id into a short display label. */
function formatModelLabel(modelId: string): string {
  const stripped = modelId.includes("/") ? modelId.slice(modelId.lastIndexOf("/") + 1) : modelId;
  // gpt-oss-120b → GPT-OSS 120B
  return stripped
    .replace(/[-_]/g, " ")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\boss\b/gi, "OSS")
    .replace(/(\d+)b\b/gi, "$1B")
    .trim();
}
