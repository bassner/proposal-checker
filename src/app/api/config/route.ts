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
    models.push({
      provider: "azure",
      label: "Azure OpenAI (GPT-5.2)",
      model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2",
    });
  }

  if (allowedProviders.includes("ollama") && process.env.OLLAMA_API_KEY) {
    models.push({
      provider: "ollama",
      label: `Ollama (${process.env.OLLAMA_MODEL || "gpt-oss:120b"})`,
      model: process.env.OLLAMA_MODEL || "gpt-oss:120b",
    });
  }

  // If allowed providers are configured but no API keys, show them anyway
  // (they'll fail at runtime with a clear error)
  if (models.length === 0) {
    if (allowedProviders.includes("azure")) {
      models.push({ provider: "azure", label: "Azure OpenAI (GPT-5.2)", model: "gpt-5.2" });
    }
    if (allowedProviders.includes("ollama")) {
      models.push({ provider: "ollama", label: "Ollama (GPT-OSS 120B)", model: "gpt-oss:120b" });
    }
  }

  return Response.json({ models });
}
