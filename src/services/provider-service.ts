import type { Model, ModelCapabilities, Provider } from "../types";
import { generateText, jsonSchema, tool } from "ai";
import { APICallError } from "@ai-sdk/provider";
import { appFetch } from "../lib/http";
import { buildProviderHeaders } from "./provider-headers";
import {
  isAzureOpenAIProvider,
  resolveAdapterBaseUrl,
  resolveProviderResourceUrl,
} from "./provider-request";
import { getLanguageModel } from "./runtime/ai-sdk/ai-sdk-runtime";
import { z } from "zod";

export interface ProbeResult {
  capabilities: Partial<ModelCapabilities>;
  warnings: string[];
}

const PROBE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function resolveSdkModel(provider: Provider, modelId: string) {
  return getLanguageModel({
    apiFormat: provider.apiFormat,
    baseUrl: resolveAdapterBaseUrl(provider, modelId),
    headers: buildProviderHeaders(provider),
    modelId,
  });
}

function errorDetail(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const body = error.responseBody?.trim().slice(0, 160);
    return `HTTP ${error.statusCode ?? "error"}${body ? `: ${body}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export interface ProviderModelPayload {
  id: string;
  object?: string;
  context_length?: number;
}

const modelPayloadSchema = z
  .object({
    id: z.string().min(1),
    object: z.string().optional(),
    context_length: z.number().finite().optional(),
  })
  .passthrough();
const modelListSchema = z.union([
  z.object({ data: z.array(modelPayloadSchema) }).passthrough(),
  z.array(modelPayloadSchema),
]);
const geminiModelSchema = z.object({ name: z.string().min(1) }).passthrough();
const geminiListSchema = z.object({ models: z.array(geminiModelSchema) }).passthrough();
const ollamaModelSchema = z
  .object({ name: z.string().optional(), model: z.string().optional() })
  .passthrough()
  .refine((value) => Boolean(value.name || value.model), "model name is missing");
const ollamaListSchema = z.object({ models: z.array(ollamaModelSchema) }).passthrough();

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
    inputModalities: ["text"],
    outputModalities: ["text"],
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
    const parsed = geminiListSchema.parse(json);
    return parsed.models
      .map((model) => model.name.replace(/^models\//, ""))
      .map((id) => ({ id, object: "model" }));
  }
  if (profileId === "ollama") {
    const parsed = ollamaListSchema.parse(json);
    return parsed.models
      .map((model) => model.name ?? model.model!)
      .map((id) => ({ id, object: "model" }));
  }
  const parsed = modelListSchema.parse(json);
  const models = Array.isArray(parsed) ? parsed : parsed.data;
  return models.map(({ id, object, context_length }) => ({ id, object, context_length }));
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
): Promise<ProbeResult> {
  const model = resolveSdkModel(provider, modelId);
  const capabilities: Partial<ModelCapabilities> = {};
  const warnings: string[] = [];

  try {
    await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in one word." },
            { type: "image", image: PROBE_IMAGE },
          ],
        },
      ],
      maxOutputTokens: 8,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15000),
    });
    capabilities.vision = true;
  } catch (error) {
    warnings.push(`Vision probe failed: ${errorDetail(error)}`);
  }

  try {
    const result = await generateText({
      model,
      prompt: "Call the test tool.",
      tools: {
        test: tool({
          description: "Capability probe tool",
          inputSchema: jsonSchema<Record<string, never>>({
            type: "object",
            additionalProperties: false,
            properties: {},
          }),
        }),
      },
      toolChoice: { type: "tool", toolName: "test" },
      maxOutputTokens: 8,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15000),
    });
    if (result.toolCalls.some((call) => call.toolName === "test")) {
      capabilities.toolCall = true;
    } else {
      warnings.push("Tool probe completed without a tool call");
    }
  } catch (error) {
    warnings.push(`Tool probe failed: ${errorDetail(error)}`);
  }

  return { capabilities, warnings };
}

/**
 * Lightweight check — send minimal request to verify a model is reachable and responding.
 * Returns true if the model responds (even with an error about content), false if unreachable.
 */
export async function checkModelHealth(
  provider: Provider,
  modelId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await generateText({
      model: resolveSdkModel(provider, modelId),
      prompt: "hi",
      maxOutputTokens: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15000),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorDetail(error) };
  }
}
