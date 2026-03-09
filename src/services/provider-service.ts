import type { Model, ModelCapabilities, Provider } from "../types";
import { appFetch } from "../lib/http";
import { buildProviderHeaders } from "./provider-headers";
import { getAdapter } from "./provider-adapters";

function defaultCapabilities(): ModelCapabilities {
  return {
    vision: false,
    toolCall: false,
    reasoning: false,
    streaming: true,
  };
}

export function createModelFromProviderPayload(
  id: string,
  providerId: string,
  modelId: string,
  existing?: Model,
  contextLength?: number,
): Model {
  if (existing) return existing;
  return {
    id,
    providerId,
    modelId,
    displayName: modelId,
    avatar: null,
    enabled: true,
    capabilities: defaultCapabilities(),
    capabilitiesVerified: false,
    maxContextLength: contextLength ?? 128000,
  } as Model;
}

export async function fetchProviderModels(provider: Provider): Promise<any[]> {
  if (provider.apiFormat === "anthropic-messages") {
    // Anthropic has no /models endpoint — models are added manually
    return [];
  }
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(provider);
  const res = await appFetch(`${baseUrl}/models`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const json = await res.json();
  return json.data ?? json ?? [];
}

export async function testProviderConnection(provider: Provider): Promise<boolean> {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  if (provider.apiFormat === "anthropic-messages") {
    const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
    const res = await appFetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  }
  const res = await appFetch(`${baseUrl}/models`, {
    headers: buildProviderHeaders(provider),
    signal: AbortSignal.timeout(10000),
  });
  return res.ok;
}

export async function probeProviderModelCapabilities(
  provider: Provider,
  modelId: string,
): Promise<ModelCapabilities> {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
  const adapter = getAdapter(provider.apiFormat);
  return adapter.probeCapabilities({ baseUrl, headers, modelId });
}
