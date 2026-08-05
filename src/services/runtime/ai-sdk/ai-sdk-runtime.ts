/**
 * AISdkRuntime — P3 PoC: a ParticipantRuntime built on the Vercel AI SDK.
 *
 * Validates whether the AI SDK meaningfully reduces maintenance vs the
 * hand-rolled adapters (SSE parsing, delta normalization, error handling).
 * This is an alternative runtime, not a replacement: the chat-generation
 * path keeps using the legacy adapters until the PoC conclusion is drawn.
 */
import {
  streamText,
  tool,
  jsonSchema,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import type { GenerationEvent, GenerationError } from "../events";
import type { ParticipantRequest, ParticipantRuntime } from "../types";

/** Maps a participant request to an AI SDK language model instance. */
export type ResolveModel = (request: ParticipantRequest) => LanguageModel;

/** Extract a bare API key from request headers (Authorization / x-api-key / x-goog-api-key). */
export function extractApiKey(headers: Record<string, string>): string | undefined {
  const auth = headers["Authorization"] ?? headers["authorization"];
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return headers["x-api-key"] ?? headers["x-goog-api-key"] ?? undefined;
}

/** Default resolver: protocol → provider factory (OpenAI-compatible for the rest). */
export function createModelResolver(): ResolveModel {
  return (request) => {
    const apiKey = extractApiKey(request.headers);
    switch (request.apiFormat) {
      case "anthropic-messages":
        return createAnthropic({
          apiKey,
          baseURL: request.baseUrl,
          headers: request.headers,
        }).messages(request.modelId);
      case "gemini-generate-content":
        return createGoogle({
          apiKey,
          baseURL: request.baseUrl,
          headers: request.headers,
        }).generativeAI(request.modelId);
      case "responses":
        return createOpenAI({
          apiKey,
          baseURL: request.baseUrl,
          headers: request.headers,
        }).responses(request.modelId);
      default:
        return createOpenAI({
          apiKey,
          baseURL: request.baseUrl,
          headers: request.headers,
        }).chat(request.modelId);
    }
  };
}

/** Convert OpenAI-style tool defs to AI SDK tool definitions. */
export function toAiSdkTools(toolDefs: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of toolDefs as Array<{
    type?: string;
    function?: { name?: string; description?: string; parameters?: unknown };
  }>) {
    const fn = def.function;
    const name = fn?.name;
    if (!name) continue;
    out[name] = tool({
      description: fn.description,
      inputSchema: jsonSchema((fn.parameters ?? { type: "object", properties: {} }) as JSONSchema7),
    });
  }
  return out;
}

/** Classify AI SDK error text into a structured GenerationError. */
export function classifyAiSdkError(err: unknown, signal: AbortSignal): GenerationError {
  if (signal.aborted) {
    return { code: "aborted", message: "Run cancelled", retryable: false };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/aborted|abort/i.test(message)) {
    return { code: "aborted", message, retryable: false };
  }
  if (/429|rate.?limit/i.test(message)) {
    return { code: "rate-limit", message, retryable: true };
  }
  if (/401|403|api key|unauthor/i.test(message)) {
    return { code: "auth", message, retryable: false };
  }
  if (/4\d\d|invalid/i.test(message)) {
    return { code: "invalid-request", message, retryable: false };
  }
  if (/5\d\d|server/i.test(message)) {
    return { code: "api", message, retryable: true };
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
    const tools = toAiSdkTools(request.toolDefs ?? []);

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<GenerationEvent> {
        try {
          yield { type: "run-started", runId: request.runId };

          const result = streamText({
            model,
            // Our OpenAI-style messages are structurally compatible with
            // ModelMessage (role literals + content/tool_calls/tool_call_id).
            messages: request.messages as ModelMessage[],
            tools: (Object.keys(tools).length > 0 ? tools : undefined) as ToolSet | undefined,
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
                case "tool-input-start":
                  // fullStream tool-input events carry the tool call id in `id`.
                  if (!startedCalls.has(event.id)) {
                    startedCalls.add(event.id);
                    yield {
                      type: "tool-call-started",
                      callId: event.id,
                      name: event.toolName,
                    };
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
                  // Complete tool input — emit started + arguments when the
                  // provider never streamed incremental input for this call.
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
                case "finish":
                  if (event.totalUsage) {
                    yield {
                      type: "usage",
                      usage: {
                        inputTokens: event.totalUsage.inputTokens ?? 0,
                        outputTokens: event.totalUsage.outputTokens ?? 0,
                      },
                    };
                  }
                  yield { type: "run-completed", reason: event.finishReason };
                  terminated = true;
                  break;
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
            // AbortError from the underlying stream (e.g. cancel()).
            yield { type: "run-failed", error: classifyAiSdkError(err, controller.signal) };
            terminated = true;
          }

          // Stream ended without an explicit finish event — settle with the
          // result promises (backstop for unusual provider terminations).
          if (!terminated) {
            const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);
            if (usage && usage.inputTokens !== undefined) {
              yield {
                type: "usage",
                usage: {
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                },
              };
            }
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
