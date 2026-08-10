import type { ProviderType } from "@/types/review";
import type { AppRole } from "@/lib/auth/roles";

export const DEFAULT_INSTRUCTOR_AZURE_DEPLOYMENT = "gpt-5.6-sol";
export const DEFAULT_STUDENT_AZURE_DEPLOYMENT = "gpt-5.6-luna";
export const AZURE_V1_API_VERSION = "preview";
export const DEFAULT_LOCAL_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_LOCAL_BASE_URL = "https://logos.aet.cit.tum.de/v1";

type Environment = Record<string, string | undefined>;

export class ProviderConfigurationError extends Error {
  public readonly provider: ProviderType;

  constructor(
    provider: ProviderType,
    message: string
  ) {
    super(message);
    this.provider = provider;
    this.name = "ProviderConfigurationError";
  }
}

export interface AzureProviderConfig {
  provider: "azure";
  apiKey: string;
  baseURL: string;
  apiVersion: string;
  model: string;
}

export interface LocalProviderConfig {
  provider: "local";
  apiKey: string;
  baseURL: string;
  model: string;
}

export type ProviderConfig = AzureProviderConfig | LocalProviderConfig;

function azureV1ApiVersion(env: Environment): string {
  const value = env.AZURE_OPENAI_API_VERSION?.trim() || AZURE_V1_API_VERSION;
  if (value !== "preview" && value !== "v1") {
    throw new ProviderConfigurationError(
      "azure",
      "AZURE_OPENAI_API_VERSION must be preview or v1 for the /openai/v1 endpoint"
    );
  }
  return value;
}

export function azureDeploymentForRole(
  role: AppRole,
  env: Environment = process.env
): string {
  if (role === "student") {
    return env.AZURE_OPENAI_STUDENT_DEPLOYMENT?.trim()
      || DEFAULT_STUDENT_AZURE_DEPLOYMENT;
  }
  return env.AZURE_OPENAI_INSTRUCTOR_DEPLOYMENT?.trim()
    || DEFAULT_INSTRUCTOR_AZURE_DEPLOYMENT;
}

/** Normalize the resource endpoint to the Azure OpenAI v1 base URL. */
export function azureV1BaseURL(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new ProviderConfigurationError("azure", "AZURE_OPENAI_ENDPOINT is missing");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProviderConfigurationError("azure", "AZURE_OPENAI_ENDPOINT is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderConfigurationError("azure", "AZURE_OPENAI_ENDPOINT must use HTTPS");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (path && path !== "/openai/v1") {
    throw new ProviderConfigurationError(
      "azure",
      "AZURE_OPENAI_ENDPOINT must be the resource endpoint or end in /openai/v1"
    );
  }

  url.pathname = "/openai/v1";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function required(
  env: Environment,
  provider: ProviderType,
  name: string
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ProviderConfigurationError(provider, `${name} is missing`);
  }
  return value;
}

function normalizedBaseURL(raw: string, provider: ProviderType): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ProviderConfigurationError(provider, "LOCAL_LLM_BASE_URL must be a valid HTTPS URL");
  }
}

export function getProviderConfig(
  provider: "azure",
  env?: Environment,
  options?: { role?: AppRole; model?: string }
): AzureProviderConfig;
export function getProviderConfig(
  provider: "local",
  env?: Environment,
  options?: { role?: AppRole; model?: string }
): LocalProviderConfig;
export function getProviderConfig(
  provider: ProviderType,
  env?: Environment,
  options?: { role?: AppRole; model?: string }
): ProviderConfig;
export function getProviderConfig(
  provider: ProviderType,
  env: Environment = process.env,
  options: { role?: AppRole; model?: string } = {}
): ProviderConfig {
  if (provider === "azure") {
    return {
      provider,
      apiKey: required(env, provider, "AZURE_OPENAI_API_KEY"),
      baseURL: azureV1BaseURL(required(env, provider, "AZURE_OPENAI_ENDPOINT")),
      // Azure's v1 Responses API uses the stable aliases "v1" and "preview".
      apiVersion: azureV1ApiVersion(env),
      model: options.model?.trim()
        || (options.role ? azureDeploymentForRole(options.role, env) : undefined)
        || env.AZURE_OPENAI_INSTRUCTOR_DEPLOYMENT?.trim()
        || DEFAULT_INSTRUCTOR_AZURE_DEPLOYMENT,
    };
  }

  return {
    provider,
    apiKey: required(env, provider, "LOCAL_LLM_API_KEY"),
    baseURL: normalizedBaseURL(
      env.LOCAL_LLM_BASE_URL || DEFAULT_LOCAL_BASE_URL,
      provider
    ),
    model: env.LOCAL_LLM_MODEL?.trim() || DEFAULT_LOCAL_MODEL,
  };
}
