import { requireAuth } from "@/lib/auth/helpers";
import { getAllowedProviders } from "@/lib/auth/provider-access";

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

  if (allowedProviders.includes("azure") && process.env.AZURE_OPENAI_API_KEY) {
    const azureModel = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4";
    models.push({
      provider: "azure",
      label: `Azure OpenAI (${azureModel})`,
      model: azureModel,
    });
  }

  if (allowedProviders.includes("local") && process.env.LOCAL_LLM_API_KEY) {
    const localModel = process.env.LOCAL_LLM_MODEL || "openai/gpt-oss-120b";
    models.push({
      provider: "local",
      label: `Local LLM (${formatModelLabel(localModel)})`,
      model: localModel,
    });
  }

  // If allowed providers are configured but no API keys, show them anyway
  // (they'll fail at runtime with a clear error)
  if (models.length === 0) {
    if (allowedProviders.includes("azure")) {
      models.push({ provider: "azure", label: `Azure OpenAI (${process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4"})`, model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4" });
    }
    if (allowedProviders.includes("local")) {
      const localModel = process.env.LOCAL_LLM_MODEL || "openai/gpt-oss-120b";
      models.push({ provider: "local", label: `Local LLM (${formatModelLabel(localModel)})`, model: localModel });
    }
  }

  return Response.json({ models });
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
