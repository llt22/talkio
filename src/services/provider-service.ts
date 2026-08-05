import type { Model, ModelCapabilities, Provider } from "../types";
import { appFetch } from "../lib/http";
import { buildProviderHeaders } from "./provider-headers";
import { getAdapter } from "./provider-adapters";
import {
  appendResourcePath,
  isAzureOpenAIProvider,
  resolveAdapterBaseUrl,
  resolveProviderResourceUrl,
} from "./provider-request";

export interface ProviderModelPayload {
  id: string;
  object?: string;
  context_length?: number;
}

function objectArray(value: unknown, key?: string): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const candidate = key ? (value as Record<string, unknown>)[key] : value;
  return Array.isArray(candidate)
    ? candidate.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
      )
    : [];
}

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

export async function fetchProviderModels(provider: Provider): Promise<ProviderModelPayload[]> {
  if (provider.apiFormat === "anthropic-messages" || isAzureOpenAIProvider(provider)) {
    // Anthropic and Azure deployments are configured manually.
    return [];
  }
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(provider);
  const profileId = provider.profileId;
  const path = profileId === "ollama" ? "/api/tags" : "/models";
  const res = await appFetch(`${baseUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const json: unknown = await res.json();
  if (provider.apiFormat === "gemini-generate-content") {
    return objectArray(json, "models")
      .map((model) => (typeof model.name === "string" ? model.name.replace(/^models\//, "") : ""))
      .filter(Boolean)
      .map((id) => ({ id, object: "model" }));
  }
  if (profileId === "ollama") {
    return objectArray(json, "models")
      .map((model) =>
        typeof model.name === "string"
          ? model.name
          : typeof model.model === "string"
            ? model.model
            : "",
      )
      .filter(Boolean)
      .map((id) => ({ id, object: "model" }));
  }
  const models =
    objectArray(json, "data").length > 0 ? objectArray(json, "data") : objectArray(json);
  return models
    .filter((model) => typeof model.id === "string")
    .map((model) => ({
      id: model.id as string,
      object: typeof model.object === "string" ? model.object : undefined,
      context_length: typeof model.context_length === "number" ? model.context_length : undefined,
    }));
}

export async function testProviderConnection(provider: Provider): Promise<boolean> {
  const headers = buildProviderHeaders(provider);
  if (provider.apiFormat === "anthropic-messages") {
    const res = await appFetch(resolveProviderResourceUrl(provider, "/v1/messages"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  }
  if (isAzureOpenAIProvider(provider)) {
    // A deployment name is a model id in Talkio; connection is verified when
    // that model is selected or health-checked.
    return Boolean(provider.baseUrl && provider.apiKey);
  }
  const path = provider.profileId === "ollama" ? "/api/tags" : "/models";
  const res = await appFetch(resolveProviderResourceUrl(provider, path), {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  return res.ok;
}

export async function probeProviderModelCapabilities(
  provider: Provider,
  modelId: string,
): Promise<ModelCapabilities> {
  const baseUrl = resolveAdapterBaseUrl(provider, modelId);
  const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
  const adapter = getAdapter(provider.apiFormat);
  return adapter.probeCapabilities({ baseUrl, headers, modelId });
}

/**
 * Lightweight check — send minimal request to verify a model is reachable and responding.
 * Returns true if the model responds (even with an error about content), false if unreachable.
 */
export async function checkModelHealth(
  provider: Provider,
  modelId: string,
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = resolveAdapterBaseUrl(provider, modelId);
  const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });

  try {
    if (provider.apiFormat === "anthropic-messages") {
      const res = await appFetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}${text ? ": " + text.slice(0, 120) : ""}` };
    }

    const endpoint =
      provider.apiFormat === "responses"
        ? appendResourcePath(baseUrl, "/responses")
        : appendResourcePath(baseUrl, "/chat/completions");

    const body =
      provider.apiFormat === "responses"
        ? { model: modelId, input: "hi", max_output_tokens: 1 }
        : { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };

    const res = await appFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `${res.status}${text ? ": " + text.slice(0, 120) : ""}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Unknown error" };
  }
}
