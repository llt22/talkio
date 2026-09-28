/**
 * AISdkRuntime — the production ParticipantRuntime, built on the Vercel AI SDK.
 *
 * Replaces the hand-rolled provider adapters + SSE parsers: message shaping,
 * provider protocol, streaming, tool-call and reasoning normalization are all
 * owned by the AI SDK. Talkio only converts its internal messages to the SDK's
 * standard `ModelMessage` (done upstream in the message builder) and maps the
 * SDK's `fullStream` back to Talkio's `GenerationEvent`s.
 */
import {
  streamText,
  stepCountIs,
  tool,
  jsonSchema,
  RetryError,
  extractReasoningMiddleware,
  wrapLanguageModel,
  type JSONSchema7,
  type LanguageModel,
  type ToolSet,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { APICallError, type LanguageModelV4 } from "@ai-sdk/provider";
import { appFetch } from "../../../lib/http";
import { createStreamedCompletionFetch } from "./streamed-completion-fetch";
import type { ApiFormat } from "../../../types";
import type { GenerationEvent, GenerationError } from "../events";
import type { ParticipantRequest, ParticipantRuntime } from "../types";

/** Maps a participant request to an AI SDK language model instance. */
export type ResolveModel = (request: ParticipantRequest) => LanguageModel;

/** Gemini image-output models (nano-banana): mirrors the legacy adapter gate. */
function supportsImageOutput(modelId: string): boolean {
  return /-image(-|$)|image-generation/i.test(modelId);
}

/** Extract a bare API key from request headers (Authorization / x-api-key / x-goog-api-key). */
export function extractApiKey(headers: Record<string, string>): string | undefined {
  const auth = headers["Authorization"] ?? headers["authorization"];
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return (
    headers["x-api-key"] ??
    headers["x-goog-api-key"] ??
    headers["api-key"] ??
    headers["X-Api-Key"] ??
    undefined
  );
}

/**
 * Keep caller-provided headers intact. Provider SDK defaults are merged before
 * these headers, so explicit custom auth (Azure api-key, Basic auth, gateways)
 * remains authoritative.
 */
function passthroughHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers };
}

function splitBaseUrl(baseUrl: string): {
  baseURL: string;
  queryParams?: Record<string, string>;
} {
  if (!baseUrl.includes("?")) return { baseURL: baseUrl.replace(/\/$/, "") };
  const url = new URL(baseUrl);
  const queryParams = Object.fromEntries(url.searchParams.entries());
  url.search = "";
  url.hash = "";
  return {
    baseURL: url.toString().replace(/\/$/, ""),
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  };
}

/** Minimal shape needed to resolve a model — shared by chat, compression, probing. */
export interface ModelResolveOptions {
  apiFormat?: ApiFormat;
  baseUrl: string;
  headers: Record<string, string>;
  modelId: string;
}

/** Resolve an AI SDK LanguageModel, routing every provider request through appFetch (CORS). */
export function getLanguageModel(opts: ModelResolveOptions): LanguageModelV4 {
  const apiKey = extractApiKey(opts.headers);
  const headers = passthroughHeaders(opts.headers);
  const fetch = appFetch as unknown as typeof globalThis.fetch;
  let model: LanguageModelV4;
  switch (opts.apiFormat) {
    case "anthropic-messages":
      model = createAnthropic({ apiKey, baseURL: opts.baseUrl, headers, fetch }).messages(
        opts.modelId,
      );
      break;
    case "gemini-generate-content":
      model = createGoogle({ apiKey, baseURL: opts.baseUrl, headers, fetch }).chat(opts.modelId);
      break;
    case "responses":
      model = createOpenAI({ apiKey, baseURL: opts.baseUrl, headers, fetch }).responses(
        opts.modelId,
      );
      break;
    default: {
      // OpenAI-compatible covers real OpenAI + third-party gateways and, unlike
      // @ai-sdk/openai, surfaces `delta.reasoning` (build4ai / OpenRouter / etc.)
      // so reasoning models show their thinking.
      const { baseURL, queryParams } = splitBaseUrl(opts.baseUrl);
      const usesHeaderApiKey = Object.keys(opts.headers).some(
        (name) => name.toLowerCase() === "api-key" || name.toLowerCase() === "x-api-key",
      );
      model = createOpenAICompatible({
        name: "openai-compatible",
        baseURL,
        queryParams,
        apiKey: usesHeaderApiKey ? undefined : apiKey,
        headers,
        // Gateways such as Chatbox AI stream even when the request asks for JSON.
        fetch: createStreamedCompletionFetch(fetch),
        includeUsage: true,
      }).chatModel(opts.modelId);
      break;
    }
  }
  return wrapLanguageModel({
    model,
    middleware: [
      extractReasoningMiddleware({ tagName: "think" }),
      extractReasoningMiddleware({ tagName: "thinking" }),
    ],
  });
}

/** Default resolver: protocol → provider factory (OpenAI-compatible for the rest). */
export function createModelResolver(): ResolveModel {
  return (request) =>
    getLanguageModel({
      apiFormat: request.apiFormat,
      baseUrl: request.baseUrl,
      headers: request.headers,
      modelId: request.modelId,
    });
}

/** Convert OpenAI-style tool defs to AI SDK tools. When `executeTool` is given,
 * each tool gets an `execute` so the SDK runs the whole tool loop itself. */
export function toAiSdkTools(
  toolDefs: unknown[],
  executeTool?: (name: string, input: Record<string, unknown>) => Promise<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of toolDefs as Array<{
    type?: string;
    function?: { name?: string; description?: string; parameters?: unknown };
  }>) {
    const fn = def.function;
    const name = fn?.name;
    if (!name) continue;
    const inputSchema = jsonSchema<Record<string, unknown>>(
      (fn.parameters ?? { type: "object", properties: {} }) as JSONSchema7,
    );
    out[name] = executeTool
      ? tool({
          description: fn.description,
          inputSchema,
          execute: (input) => executeTool(name, input),
        })
      : tool({ description: fn.description, inputSchema });
  }
  return out;
}

/** Coerce an AI SDK tool-result output into the text Talkio persists/displays. */
function toolResultText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as { type?: string; value?: unknown };
    if (typeof o.value === "string") return o.value;
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

/** Build per-provider options (Gemini image output). Reasoning goes via the top-level setting. */
function buildProviderOptions(request: ParticipantRequest): Record<string, unknown> | undefined {
  const imageOutput =
    request.outputModalities?.includes("image") || supportsImageOutput(request.modelId);
  if (request.apiFormat === "gemini-generate-content" && imageOutput) {
    return { google: { responseModalities: ["TEXT", "IMAGE"] } };
  }
  return undefined;
}

function completeUsage(
  usage: { inputTokens?: number; outputTokens?: number } | null | undefined,
): { inputTokens: number; outputTokens: number } | undefined {
  if (
    typeof usage?.inputTokens !== "number" ||
    !Number.isFinite(usage.inputTokens) ||
    typeof usage.outputTokens !== "number" ||
    !Number.isFinite(usage.outputTokens)
  ) {
    return undefined;
  }
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

function unwrapRetryError(error: unknown): unknown {
  if (!RetryError.isInstance(error)) return error;
  return error.lastError ?? error;
}

/** Classify AI SDK errors without depending on provider-specific message text. */
export function classifyAiSdkError(err: unknown, signal: AbortSignal): GenerationError {
  if (signal.aborted) {
    return { code: "aborted", message: "Run cancelled", retryable: false };
  }
  const unwrapped = unwrapRetryError(err);
  const message = unwrapped instanceof Error ? unwrapped.message : String(unwrapped);
  if (unwrapped instanceof DOMException && unwrapped.name === "AbortError") {
    return { code: "aborted", message, retryable: false };
  }
  if (APICallError.isInstance(unwrapped)) {
    const status = unwrapped.statusCode;
    if (status === 429) return { code: "rate-limit", message, retryable: true };
    if (status === 401 || status === 403) {
      return { code: "auth", message, retryable: false };
    }
    if (status !== undefined && status >= 400 && status < 500) {
      return { code: "invalid-request", message, retryable: false };
    }
    return { code: "api", message, retryable: unwrapped.isRetryable };
  }
  return { code: "unknown", message, retryable: false };
}

export class AISdkRuntime implements ParticipantRuntime {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly resolveModel: ResolveModel) {}

  run(request: ParticipantRequest): AsyncIterable<GenerationEvent> {
    const controllers = this.controllers;
    const controller = new AbortController();
    controllers.set(request.runId, controller);
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", () => controller.abort(), { once: true });

    const model = this.resolveModel(request);
    const tools = toAiSdkTools(request.toolDefs ?? [], request.executeTool);
    const providerOptions = buildProviderOptions(request);

    // System goes to the standard `system` parameter, not the messages array.
    const all = request.messages;
    const systemMsg = all.find((m) => m.role === "system");
    const system = typeof systemMsg?.content === "string" ? systemMsg.content : undefined;
    const messages = all.filter((m) => m.role !== "system");

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<GenerationEvent> {
        try {
          yield { type: "run-started", runId: request.runId };

          const result = streamText({
            model,
            system,
            messages,
            tools: (Object.keys(tools).length > 0 ? tools : undefined) as ToolSet | undefined,
            // When tools carry an execute fn, let the SDK run the whole
            // call→execute→feed-back loop up to N steps.
            stopWhen: request.executeTool ? stepCountIs(request.maxToolRounds ?? 8) : undefined,
            reasoning: request.reasoningEffort as never,
            temperature: request.temperature,
            providerOptions: providerOptions as never,
            maxRetries: 2,
            abortSignal: controller.signal,
          });

          // Track which calls already emitted started/delta so complete-input
          // events (providers without incremental arguments) don't duplicate.
          const startedCalls = new Set<string>();
          const deltaCalls = new Set<string>();
          let terminated = false;

          try {
            for await (const event of result.fullStream) {
              switch (event.type) {
                case "text-delta":
                  yield { type: "text-delta", text: event.text };
                  break;
                case "reasoning-delta":
                  yield { type: "thinking-delta", text: event.text };
                  break;
                case "file":
                  // Model-generated image (e.g. Gemini nano-banana) → data URL.
                  if (event.file.mediaType?.startsWith("image/")) {
                    yield {
                      type: "image-generated",
                      url: `data:${event.file.mediaType};base64,${event.file.base64}`,
                    };
                  }
                  break;
                case "tool-input-start":
                  if (!startedCalls.has(event.id)) {
                    startedCalls.add(event.id);
                    yield { type: "tool-call-started", callId: event.id, name: event.toolName };
                  }
                  break;
                case "tool-input-delta":
                  deltaCalls.add(event.id);
                  yield {
                    type: "tool-call-arguments-delta",
                    callId: event.id,
                    delta: event.delta,
                  };
                  break;
                case "tool-call": {
                  const callId = event.toolCallId;
                  if (!startedCalls.has(callId)) {
                    startedCalls.add(callId);
                    yield { type: "tool-call-started", callId, name: event.toolName };
                  }
                  if (!deltaCalls.has(callId)) {
                    yield {
                      type: "tool-call-arguments-delta",
                      callId,
                      delta: JSON.stringify(event.input ?? {}),
                    };
                  }
                  break;
                }
                case "tool-result":
                  // The SDK ran the tool's execute() and fed the result back.
                  yield {
                    type: "tool-result",
                    callId: event.toolCallId,
                    result: toolResultText(event.output),
                  };
                  break;
                case "tool-error":
                  yield {
                    type: "tool-result",
                    callId: event.toolCallId,
                    result: `Error: ${event.error instanceof Error ? event.error.message : String(event.error)}`,
                  };
                  break;
                case "finish": {
                  const finalUsage = completeUsage(event.totalUsage);
                  if (finalUsage) yield { type: "usage", usage: finalUsage };
                  yield { type: "run-completed", reason: event.finishReason };
                  terminated = true;
                  break;
                }
                case "abort":
                  yield {
                    type: "run-failed",
                    error: { code: "aborted", message: "Run cancelled", retryable: false },
                  };
                  terminated = true;
                  break;
                case "error":
                  yield {
                    type: "run-failed",
                    error: classifyAiSdkError(event.error, controller.signal),
                  };
                  terminated = true;
                  break;
                default:
                  break;
              }
              if (terminated) break;
            }
          } catch (err) {
            yield { type: "run-failed", error: classifyAiSdkError(err, controller.signal) };
            terminated = true;
          }

          if (!terminated) {
            const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);
            const finalUsage = completeUsage(usage);
            if (finalUsage) yield { type: "usage", usage: finalUsage };
            yield { type: "run-completed", reason: finishReason ?? "completed" };
          }
        } finally {
          controllers.delete(request.runId);
        }
      },
    };
  }

  async cancel(runId: string): Promise<void> {
    this.controllers.get(runId)?.abort();
  }
}
