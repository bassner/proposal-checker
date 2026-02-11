import { NextResponse } from "next/server";

export async function GET() {
  const models = [];

  if (process.env.AZURE_OPENAI_API_KEY) {
    models.push({
      provider: "azure",
      label: "Azure OpenAI (GPT-5.2)",
      model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2",
    });
  }

  if (process.env.OLLAMA_API_KEY) {
    models.push({
      provider: "ollama",
      label: `Ollama (${process.env.OLLAMA_MODEL || "gpt-oss:120b"})`,
      model: process.env.OLLAMA_MODEL || "gpt-oss:120b",
    });
  }

  // If no keys configured, show both as options (they'll fail at runtime with a clear error)
  if (models.length === 0) {
    models.push(
      { provider: "azure", label: "Azure OpenAI (GPT-5.2)", model: "gpt-5.2" },
      { provider: "ollama", label: "Ollama (GPT-OSS 120B)", model: "gpt-oss:120b" }
    );
  }

  return NextResponse.json({ models });
}
