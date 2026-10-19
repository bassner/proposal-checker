import type { ProviderType } from "@/types/review";
import type { AppRole } from "@/lib/auth/roles";

export const DEFAULT_CLOUD_INSTRUCTOR_MODEL = "gpt-6.1-sol";
export const DEFAULT_CLOUD_STUDENT_MODEL = "gpt-6-luna";
export const AZURE_V1_API_VERSION = "preview";
export const DEFAULT_LOGOS_BASE_URL = "https://logos.aet.cit.tum.de/v1";
export const DEFAULT_LOGOS_MODEL = "Qwen/Qwen3.8-27B";
export const DEFAULT_MORPHEUS_BASE_URL = "https://morpheus.cit.tum.de/api/v1";
export const DEFAULT_MORPHEUS_MODEL = "cyankiwi/Qwen3.8-Flash-Next-AWQ-INT4";

type Environment = Record<string, string | undefined>;
type OpenWeightProvider = Exclude<ProviderType, "cloud">;

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

export interface CloudProviderConfig {
  provider: "cloud";
  apiKey: string;
  baseURL: string;
  /** Set only for Azure OpenAI hosts, which need `api-version` and `api-key`. */
  azureApiVersion: string | null;
  model: string;
}

export interface OpenWeightProviderConfig {
  provider: OpenWeightProvider;
  apiKey: string;
  baseURL: string;
  model: string;
}

export type ProviderConfig = CloudProviderConfig | OpenWeightProviderConfig;

/** Env variable prefixes and defaults for the self-hosted, OpenAI-compatible providers. */
const OPEN_WEIGHT_PROVIDERS: Record<OpenWeightProvider, { envPrefix: string; baseURL: string; model: string }> = {
  "logos-local": { envPrefix: "LOGOS_LLM", baseURL: DEFAULT_LOGOS_BASE_URL, model: DEFAULT_LOGOS_MODEL },
  morpheus: { envPrefix: "MORPHEUS_LLM", baseURL: DEFAULT_MORPHEUS_BASE_URL, model: DEFAULT_MORPHEUS_MODEL },
};

const AZURE_HOST_SUFFIXES = [".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com"];

function azureV1ApiVersion(env: Environment): string {
  const value = env.CLOUD_LLM_API_VERSION?.trim() || AZURE_V1_API_VERSION;
  if (value !== "preview" && value !== "v1") {
    throw new ProviderConfigurationError(
      "cloud",
      "CLOUD_LLM_API_VERSION must be preview or v1 for the /openai/v1 endpoint"
    );
  }
  return value;
}

function studentCloudModel(env: Environment): string {
  return env.CLOUD_LLM_STUDENT_MODEL?.trim() || DEFAULT_CLOUD_STUDENT_MODEL;
}

/** Cloud models a role may select, in preferred/default order. */
export function cloudModelsForRole(
  role: AppRole,
  env: Environment = process.env
): string[] {
  const luna = studentCloudModel(env);
  if (role === "student") return [luna];

  const sol = env.CLOUD_LLM_INSTRUCTOR_MODEL?.trim() || DEFAULT_CLOUD_INSTRUCTOR_MODEL;
  return [...new Set([sol, luna])];
}

export function cloudModelForRole(
  role: AppRole,
  env: Environment = process.env
): string {
  return cloudModelsForRole(role, env)[0];
}

/** Resolve a client-requested cloud model against the server-side role allowlist. */
export function resolveCloudModelForRole(
  role: AppRole,
  requestedModel: string | undefined,
  env: Environment = process.env
): string {
  const allowed = cloudModelsForRole(role, env);
  const requested = requestedModel?.trim();
  if (requested && !allowed.includes(requested)) {
    throw new ProviderConfigurationError(
      "cloud",
      `Cloud model ${requested} is not allowed for role ${role}`
    );
  }
  return requested || allowed[0];
}

/**
 * Resolve the model stored on an existing review (retry, new version). A model
 * that is no longer offered (e.g. after an upgrade) falls back to the role
 * default instead of failing. Never used for client-supplied model names.
 */
export function resolveStoredCloudModel(
  role: AppRole,
  storedModel: string | null | undefined,
  env: Environment = process.env
): string {
  const allowed = cloudModelsForRole(role, env);
  const stored = storedModel?.trim();
  return stored && allowed.includes(stored) ? stored : allowed[0];
}

/** Use the deeper reasoning budget for Luna while keeping Sol latency bounded. */
export function cloudReasoningEffort(
  model: string,
  env: Environment = process.env
): "high" | "max" {
  return model === studentCloudModel(env) ? "max" : "high";
}

export function isAzureHost(baseURL: string): boolean {
  try {
    const host = new URL(baseURL.trim()).hostname.toLowerCase();
    return AZURE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

/** Normalize an Azure resource endpoint to the Azure OpenAI v1 base URL. */
export function azureV1BaseURL(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new ProviderConfigurationError("cloud", "CLOUD_LLM_BASE_URL is missing");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProviderConfigurationError("cloud", "CLOUD_LLM_BASE_URL is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderConfigurationError("cloud", "CLOUD_LLM_BASE_URL must use HTTPS");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (path && path !== "/openai/v1") {
    throw new ProviderConfigurationError(
      "cloud",
      "An Azure CLOUD_LLM_BASE_URL must be the resource endpoint or end in /openai/v1"
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

function normalizedBaseURL(raw: string, provider: ProviderType, name: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ProviderConfigurationError(provider, `${name} must be a valid HTTPS URL`);
  }
}

interface ProviderConfigOptions {
  role?: AppRole;
  /** Cloud only: model requested by the client (strictly checked when `role` is set). */
  model?: string;
}

export function getProviderConfig(
  provider: "cloud",
  env?: Environment,
  options?: ProviderConfigOptions
): CloudProviderConfig;
export function getProviderConfig(
  provider: OpenWeightProvider,
  env?: Environment,
  options?: ProviderConfigOptions
): OpenWeightProviderConfig;
export function getProviderConfig(
  provider: ProviderType,
  env?: Environment,
  options?: ProviderConfigOptions
): ProviderConfig;
export function getProviderConfig(
  provider: ProviderType,
  env: Environment = process.env,
  options: ProviderConfigOptions = {}
): ProviderConfig {
  if (provider === "cloud") {
    const rawBaseURL = required(env, provider, "CLOUD_LLM_BASE_URL");
    const azure = isAzureHost(rawBaseURL);
    return {
      provider,
      apiKey: required(env, provider, "CLOUD_LLM_API_KEY"),
      baseURL: azure
        ? azureV1BaseURL(rawBaseURL)
        : normalizedBaseURL(rawBaseURL, provider, "CLOUD_LLM_BASE_URL"),
      // Azure's v1 Responses API uses the stable aliases "v1" and "preview".
      azureApiVersion: azure ? azureV1ApiVersion(env) : null,
      model: options.role
        ? resolveCloudModelForRole(options.role, options.model, env)
        : options.model?.trim()
        || env.CLOUD_LLM_INSTRUCTOR_MODEL?.trim()
        || DEFAULT_CLOUD_INSTRUCTOR_MODEL,
    };
  }

  // Open-weight providers serve one configured model; client model names are ignored.
  const defaults = OPEN_WEIGHT_PROVIDERS[provider];
  const baseURLName = `${defaults.envPrefix}_BASE_URL`;
  return {
    provider,
    apiKey: required(env, provider, `${defaults.envPrefix}_API_KEY`),
    baseURL: normalizedBaseURL(env[baseURLName]?.trim() || defaults.baseURL, provider, baseURLName),
    model: env[`${defaults.envPrefix}_MODEL`]?.trim() || defaults.model,
  };
}

/**
 * Model for a retry or new version of an existing review. Cloud reviews keep
 * their stored model when the role may still use it; otherwise the role default.
 */
export function getStoredReviewProviderConfig(
  provider: ProviderType,
  role: AppRole,
  storedModel: string | null | undefined,
  env: Environment = process.env
): ProviderConfig {
  if (provider === "cloud") {
    return getProviderConfig(provider, env, {
      role,
      model: resolveStoredCloudModel(role, storedModel, env),
    });
  }
  return getProviderConfig(provider, env);
}
