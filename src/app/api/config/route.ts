import { requireAuth } from "@/lib/auth/helpers";
import { getAllowedProviders } from "@/lib/auth/provider-access";
import {
  cloudModelsForRole,
  getProviderConfig,
  ProviderConfigurationError,
} from "@/lib/llm/provider-config";
import { PROVIDER_LABELS } from "@/types/review";

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
      if (provider === "cloud") {
        for (const model of cloudModelsForRole(session.user.role)) {
          const config = getProviderConfig(provider, process.env, {
            role: session.user.role,
            model,
          });
          models.push({
            id: `cloud:${config.model}`,
            provider,
            label: `${PROVIDER_LABELS[provider]} · ${formatModelLabel(config.model)}`,
            model: config.model,
          });
        }
        continue;
      }
      const config = getProviderConfig(provider);
      models.push({
        id: `${provider}:${config.model}`,
        provider,
        label: `${PROVIDER_LABELS[provider]} · ${formatModelLabel(config.model)}`,
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

/**
 * Strip the vendor prefix and quantization suffix and turn a model id into a
 * short display label, e.g. gpt-6.1-sol → GPT 6.1 Sol, Qwen/Qwen3.8-27B →
 * Qwen3.8 27B, cyankiwi/Qwen3.8-Flash-Next-AWQ-INT4 → Qwen3.8 Flash Next.
 */
function formatModelLabel(modelId: string): string {
  const stripped = modelId.includes("/") ? modelId.slice(modelId.lastIndexOf("/") + 1) : modelId;
  return stripped
    .replace(/-(AWQ|GPTQ|FP8|INT4|INT8)\b.*$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\boss\b/gi, "OSS")
    .replace(/\b(sol|luna)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(/(\d+)b\b/gi, "$1B")
    .trim();
}
