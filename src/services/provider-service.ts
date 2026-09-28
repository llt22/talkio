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

/** Completion recovered from an SSE body a gateway returned to a non-streaming request. */
interface StreamedCompletion {
  statusCode: number;
  text: string;
  toolCalls: string[];
  streamError?: string;
}

/** A well-formed SSE frame carrying a JSON payload. */
const SSE_DATA_LINE = /^data:\s*[{[]/m;

const streamedChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  function: z.object({ name: z.string().nullish() }).nullish(),
                }),
              )
              .nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  error: z.union([z.string(), z.object({ message: z.string().nullish() })]).nullish(),
});

/**
 * Some OpenAI-compatible gateways (Chatbox AI, several proxies) answer
 * non-streaming requests with an SSE stream regardless of `stream: false`. The
 * AI SDK parses non-streaming bodies as JSON, so those responses surface as a
 * 2xx `APICallError` instead of a completion. Rebuild the completion from the
 * raw body so reachability and capability probes keep working.
 *
 * Returns undefined when the error is not an SSE completion, e.g. a real HTTP
 * failure or a non-SSE error page.
 */
function recoverStreamedCompletion(error: unknown): StreamedCompletion | undefined {
  if (!APICallError.isInstance(error)) return undefined;
  const statusCode = error.statusCode;
  if (statusCode === undefined || statusCode < 200 || statusCode >= 300) return undefined;
  const body = error.responseBody;
  if (!body || !SSE_DATA_LINE.test(body)) return undefined;

  const text: string[] = [];
  const toolCalls: string[] = [];
  let streamError: string | undefined;

  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    const chunk = streamedChunkSchema.safeParse(parsed);
    if (!chunk.success) continue;
    const { error: chunkError, choices } = chunk.data;
    if (chunkError != null) {
      streamError =
        typeof chunkError === "string" ? chunkError : (chunkError.message ?? "Stream error");
    }
    for (const choice of choices ?? []) {
      const delta = choice.delta;
      if (delta?.content) text.push(delta.content);
      for (const call of delta?.tool_calls ?? []) {
        const name = call.function?.name;
        if (name) toolCalls.push(name);
      }
    }
  }

  return { statusCode, text: text.join(""), toolCalls, streamError };
}

type ProbeResponse =
  | { status: "ok" | "streamed"; text: string; toolCalls: string[] }
  | { status: "error"; error: string };

/**
 * Run one non-streaming probe request, transparently supporting gateways that
 * answer with SSE whether or not streaming was requested.
 */
async function runProbeRequest(
  options: Parameters<typeof generateText>[0],
): Promise<ProbeResponse> {
  try {
    const result = await generateText(options);
    return {
      status: "ok",
      text: result.text,
      toolCalls: result.toolCalls.map((call) => call.toolName),
    };
  } catch (error) {
    const streamed = recoverStreamedCompletion(error);
    if (streamed?.streamError) {
      return { status: "error", error: `HTTP ${streamed.statusCode}: ${streamed.streamError}` };
    }
    if (streamed) {
      return { status: "streamed", text: streamed.text, toolCalls: streamed.toolCalls };
    }
    return { status: "error", error: errorDetail(error) };
  }
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

  const vision = await runProbeRequest({
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
  // Either transport confirms the model accepted the image input.
  if (vision.status !== "error") capabilities.vision = true;
  else warnings.push(`Vision probe failed: ${vision.error}`);

  const tools = await runProbeRequest({
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
  if (tools.status === "error") {
    warnings.push(`Tool probe failed: ${tools.error}`);
  } else if (tools.toolCalls.includes("test")) {
    capabilities.toolCall = true;
  } else {
    warnings.push("Tool probe completed without a tool call");
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
  const result = await runProbeRequest({
    model: resolveSdkModel(provider, modelId),
    prompt: "hi",
    maxOutputTokens: 1,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(15000),
  });
  if (result.status === "error") return { ok: false, error: result.error };
  // A streamed body without text still proves the endpoint answered the request.
  return { ok: true };
}
