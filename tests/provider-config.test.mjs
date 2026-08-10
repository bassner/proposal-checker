import assert from "node:assert/strict";
import test from "node:test";

import {
  AZURE_V1_API_VERSION,
  DEFAULT_INSTRUCTOR_AZURE_DEPLOYMENT,
  DEFAULT_STUDENT_AZURE_DEPLOYMENT,
  ProviderConfigurationError,
  azureDeploymentForRole,
  azureV1BaseURL,
  getProviderConfig,
} from "../src/lib/llm/provider-config.ts";

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

test("selects Azure deployments by server-side application role", () => {
  assert.equal(azureDeploymentForRole("admin", {}), DEFAULT_INSTRUCTOR_AZURE_DEPLOYMENT);
  assert.equal(azureDeploymentForRole("phd", {}), DEFAULT_INSTRUCTOR_AZURE_DEPLOYMENT);
  assert.equal(azureDeploymentForRole("student", {}), DEFAULT_STUDENT_AZURE_DEPLOYMENT);
  assert.equal(
    azureDeploymentForRole("student", { AZURE_OPENAI_STUDENT_DEPLOYMENT: "student-custom" }),
    "student-custom"
  );
});

test("builds one consistent Azure v1 configuration", () => {
  const config = getProviderConfig("azure", {
    AZURE_OPENAI_API_KEY: "test-key",
    AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/",
  }, { role: "student" });

  assert.deepEqual(config, {
    provider: "azure",
    apiKey: "test-key",
    baseURL: "https://example.openai.azure.com/openai/v1",
    apiVersion: AZURE_V1_API_VERSION,
    model: DEFAULT_STUDENT_AZURE_DEPLOYMENT,
  });
});

test("rejects legacy date-based API versions with the v1 endpoint", () => {
  assert.throws(
    () => getProviderConfig("azure", {
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/",
      AZURE_OPENAI_API_VERSION: "2025-04-01-preview",
    }, { role: "admin" }),
    /must be preview or v1/
  );
});

test("keeps GPT-OSS 120B as the local default for every role", () => {
  const config = getProviderConfig("local", {
    LOCAL_LLM_API_KEY: "test-key",
    LOCAL_LLM_BASE_URL: "https://llm.example/v1",
  });
  assert.equal(config.model, "openai/gpt-oss-120b");
});

test("fails fast when a provider credential is missing", () => {
  assert.throws(
    () => getProviderConfig("azure", { AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com" }),
    /AZURE_OPENAI_API_KEY is missing/
  );
  assert.throws(
    () => getProviderConfig("local", { LOCAL_LLM_BASE_URL: "https://llm.example/v1" }),
    /LOCAL_LLM_API_KEY is missing/
  );
});
