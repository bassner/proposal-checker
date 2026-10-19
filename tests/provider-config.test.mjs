import assert from "node:assert/strict";
import test from "node:test";

import {
  AZURE_V1_API_VERSION,
  DEFAULT_CLOUD_INSTRUCTOR_MODEL,
  DEFAULT_CLOUD_STUDENT_MODEL,
  DEFAULT_LOGOS_BASE_URL,
  DEFAULT_LOGOS_MODEL,
  DEFAULT_MORPHEUS_BASE_URL,
  DEFAULT_MORPHEUS_MODEL,
  ProviderConfigurationError,
  azureV1BaseURL,
  cloudModelForRole,
  cloudModelsForRole,
  cloudReasoningEffort,
  getProviderConfig,
  getStoredReviewProviderConfig,
  isAzureHost,
  resolveCloudModelForRole,
  resolveStoredCloudModel,
} from "../src/lib/llm/provider-config.ts";

const LOGOS_CLOUD_ENV = {
  CLOUD_LLM_BASE_URL: "https://logos.aet.cit.tum.de/v1/",
  CLOUD_LLM_API_KEY: "test-key",
};
const AZURE_CLOUD_ENV = {
  CLOUD_LLM_BASE_URL: "https://example.openai.azure.com/",
  CLOUD_LLM_API_KEY: "test-key",
};

test("normalizes Azure resource endpoints with or without a trailing slash", () => {
  assert.equal(
    azureV1BaseURL("https://example.openai.azure.com"),
    "https://example.openai.azure.com/openai/v1"
  );
  assert.equal(
    azureV1BaseURL("https://example.openai.azure.com/"),
    "https://example.openai.azure.com/openai/v1"
  );
  assert.equal(
    azureV1BaseURL("https://example.openai.azure.com/openai/v1/"),
    "https://example.openai.azure.com/openai/v1"
  );
});

test("rejects malformed and unsafe Azure endpoints", () => {
  assert.throws(
    () => azureV1BaseURL("example.openai.azure.com"),
    ProviderConfigurationError
  );
  assert.throws(
    () => azureV1BaseURL("http://example.openai.azure.com"),
    /must use HTTPS/
  );
  assert.throws(
    () => azureV1BaseURL("https://example.openai.azure.com/unexpected"),
    /resource endpoint/
  );
});

test("detects Azure hosts only by host name", () => {
  assert.equal(isAzureHost("https://example.openai.azure.com/"), true);
  assert.equal(isAzureHost("https://example.cognitiveservices.azure.com"), true);
  assert.equal(isAzureHost("https://logos.aet.cit.tum.de/v1"), false);
  assert.equal(isAzureHost("https://openai.azure.com.evil.example/v1"), false);
  assert.equal(isAzureHost("not a url"), false);
});

test("selects cloud models by server-side application role", () => {
  assert.equal(cloudModelForRole("admin", {}), DEFAULT_CLOUD_INSTRUCTOR_MODEL);
  assert.equal(cloudModelForRole("phd", {}), DEFAULT_CLOUD_INSTRUCTOR_MODEL);
  assert.equal(cloudModelForRole("student", {}), DEFAULT_CLOUD_STUDENT_MODEL);
  assert.equal(
    cloudModelForRole("student", { CLOUD_LLM_STUDENT_MODEL: "student-custom" }),
    "student-custom"
  );
});

test("defaults to GPT-6.1 Sol and GPT-6 Luna", () => {
  assert.equal(DEFAULT_CLOUD_INSTRUCTOR_MODEL, "gpt-6.1-sol");
  assert.equal(DEFAULT_CLOUD_STUDENT_MODEL, "gpt-6-luna");
});

test("offers Sol and Luna to instructors, but only Luna to students", () => {
  assert.deepEqual(cloudModelsForRole("admin", {}), [
    DEFAULT_CLOUD_INSTRUCTOR_MODEL,
    DEFAULT_CLOUD_STUDENT_MODEL,
  ]);
  assert.deepEqual(cloudModelsForRole("phd", {}), [
    DEFAULT_CLOUD_INSTRUCTOR_MODEL,
    DEFAULT_CLOUD_STUDENT_MODEL,
  ]);
  assert.deepEqual(cloudModelsForRole("student", {}), [
    DEFAULT_CLOUD_STUDENT_MODEL,
  ]);
});

test("rejects client-requested cloud models outside the role allowlist", () => {
  assert.equal(
    resolveCloudModelForRole("phd", DEFAULT_CLOUD_STUDENT_MODEL, {}),
    DEFAULT_CLOUD_STUDENT_MODEL
  );
  assert.throws(
    () => resolveCloudModelForRole("student", DEFAULT_CLOUD_INSTRUCTOR_MODEL, {}),
    /not allowed for role student/
  );
  assert.throws(
    () => resolveCloudModelForRole("admin", "gpt-anything-else", {}),
    /not allowed for role admin/
  );
  assert.throws(
    () => getProviderConfig("cloud", LOGOS_CLOUD_ENV, { role: "student", model: DEFAULT_CLOUD_INSTRUCTOR_MODEL }),
    /not allowed for role student/
  );
});

test("falls back to the role default for stored models that are no longer offered", () => {
  assert.equal(resolveStoredCloudModel("admin", "gpt-5.6-sol", {}), DEFAULT_CLOUD_INSTRUCTOR_MODEL);
  assert.equal(resolveStoredCloudModel("student", "gpt-5.6-luna", {}), DEFAULT_CLOUD_STUDENT_MODEL);
  assert.equal(resolveStoredCloudModel("phd", null, {}), DEFAULT_CLOUD_INSTRUCTOR_MODEL);
  assert.equal(resolveStoredCloudModel("phd", DEFAULT_CLOUD_STUDENT_MODEL, {}), DEFAULT_CLOUD_STUDENT_MODEL);
  // A student retrying a Sol review gets Luna, not Sol.
  assert.equal(resolveStoredCloudModel("student", DEFAULT_CLOUD_INSTRUCTOR_MODEL, {}), DEFAULT_CLOUD_STUDENT_MODEL);
  assert.equal(
    getStoredReviewProviderConfig("cloud", "admin", "gpt-5.6-sol", LOGOS_CLOUD_ENV).model,
    DEFAULT_CLOUD_INSTRUCTOR_MODEL
  );
});

test("uses max reasoning for Luna and high reasoning for Sol", () => {
  assert.equal(cloudReasoningEffort(DEFAULT_CLOUD_STUDENT_MODEL, {}), "max");
  assert.equal(cloudReasoningEffort(DEFAULT_CLOUD_INSTRUCTOR_MODEL, {}), "high");
});

test("builds a plain OpenAI-compatible cloud configuration for Logos", () => {
  const config = getProviderConfig("cloud", LOGOS_CLOUD_ENV, { role: "student" });
  assert.deepEqual(config, {
    provider: "cloud",
    apiKey: "test-key",
    baseURL: "https://logos.aet.cit.tum.de/v1",
    azureApiVersion: null,
    model: DEFAULT_CLOUD_STUDENT_MODEL,
  });
});

test("builds an Azure v1 cloud configuration for Azure hosts", () => {
  const config = getProviderConfig("cloud", AZURE_CLOUD_ENV, { role: "student" });
  assert.deepEqual(config, {
    provider: "cloud",
    apiKey: "test-key",
    baseURL: "https://example.openai.azure.com/openai/v1",
    azureApiVersion: AZURE_V1_API_VERSION,
    model: DEFAULT_CLOUD_STUDENT_MODEL,
  });
});

test("rejects legacy date-based API versions with the Azure v1 endpoint", () => {
  assert.throws(
    () => getProviderConfig("cloud", {
      ...AZURE_CLOUD_ENV,
      CLOUD_LLM_API_VERSION: "2025-04-01-preview",
    }, { role: "admin" }),
    /must be preview or v1/
  );
});

test("uses Qwen3.8 27B on Logos and Qwen3.8 Flash Next on Morpheus by default", () => {
  const logos = getProviderConfig("logos-local", { LOGOS_LLM_API_KEY: "logos-key" });
  assert.deepEqual(logos, {
    provider: "logos-local",
    apiKey: "logos-key",
    baseURL: DEFAULT_LOGOS_BASE_URL,
    model: DEFAULT_LOGOS_MODEL,
  });
  assert.equal(logos.model, "Qwen/Qwen3.8-27B");

  const morpheus = getProviderConfig("morpheus", { MORPHEUS_LLM_API_KEY: "morpheus-key" });
  assert.deepEqual(morpheus, {
    provider: "morpheus",
    apiKey: "morpheus-key",
    baseURL: DEFAULT_MORPHEUS_BASE_URL,
    model: DEFAULT_MORPHEUS_MODEL,
  });
});

test("ignores client model names for open-weight providers", () => {
  const env = { LOGOS_LLM_API_KEY: "k", MORPHEUS_LLM_API_KEY: "k" };
  assert.equal(
    getProviderConfig("logos-local", env, { role: "student", model: "gpt-6.1-sol" }).model,
    DEFAULT_LOGOS_MODEL
  );
  assert.equal(
    getProviderConfig("morpheus", env, { role: "student", model: "gpt-6.1-sol" }).model,
    DEFAULT_MORPHEUS_MODEL
  );
  assert.equal(
    getStoredReviewProviderConfig("logos-local", "student", "openai/gpt-oss-120b", env).model,
    DEFAULT_LOGOS_MODEL
  );
});

test("allows overriding open-weight endpoints and models per provider", () => {
  const config = getProviderConfig("logos-local", {
    LOGOS_LLM_API_KEY: "k",
    LOGOS_LLM_BASE_URL: "https://llm.example/v1/",
    LOGOS_LLM_MODEL: "openai/gpt-oss-120b",
  });
  assert.equal(config.baseURL, "https://llm.example/v1");
  assert.equal(config.model, "openai/gpt-oss-120b");
  assert.throws(
    () => getProviderConfig("morpheus", { MORPHEUS_LLM_API_KEY: "k", MORPHEUS_LLM_BASE_URL: "http://insecure/v1" }),
    /MORPHEUS_LLM_BASE_URL must be a valid HTTPS URL/
  );
});

test("fails fast when a provider setting is missing", () => {
  assert.throws(
    () => getProviderConfig("cloud", { CLOUD_LLM_BASE_URL: "https://logos.aet.cit.tum.de/v1" }),
    /CLOUD_LLM_API_KEY is missing/
  );
  assert.throws(
    () => getProviderConfig("cloud", { CLOUD_LLM_API_KEY: "k" }),
    /CLOUD_LLM_BASE_URL is missing/
  );
  assert.throws(
    () => getProviderConfig("logos-local", {}),
    /LOGOS_LLM_API_KEY is missing/
  );
  assert.throws(
    () => getProviderConfig("morpheus", {}),
    /MORPHEUS_LLM_API_KEY is missing/
  );
});
