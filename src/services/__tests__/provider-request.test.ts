import { describe, expect, it } from "vitest";
import type { Provider } from "../../types";
import { buildProviderHeaders } from "../provider-headers";
import {
  appendResourcePath,
  resolveAdapterBaseUrl,
  resolveProviderResourceUrl,
} from "../provider-request";

function azureProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "azure",
    name: "Azure OpenAI",
    type: "azure-openai",
    apiFormat: "chat-completions",
    profileId: "azure-openai",
    baseUrl: "https://resource.openai.azure.com/openai",
    apiKey: "secret",
    apiVersion: "2024-10-21",
    customHeaders: [],
    enabled: true,
    status: "connected",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("provider request configuration", () => {
  it("uses Azure api-key authentication", () => {
    expect(buildProviderHeaders(azureProvider())).toEqual({ "api-key": "secret" });
  });

  it("builds the Azure deployment chat completions URL", () => {
    const baseUrl = resolveAdapterBaseUrl(azureProvider(), "prod deployment");
    expect(appendResourcePath(baseUrl, "/chat/completions")).toBe(
      "https://resource.openai.azure.com/openai/deployments/prod%20deployment/chat/completions?api-version=2024-10-21",
    );
  });

  it("adds api-version to provider resources", () => {
    expect(resolveProviderResourceUrl(azureProvider(), "/models")).toBe(
      "https://resource.openai.azure.com/openai/models?api-version=2024-10-21",
    );
  });
});
