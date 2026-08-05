/**
 * NormalModelRuntime — ParticipantRuntime implementation for plain model
 * providers. Wraps the protocol adapters (chat-completions / responses /
 * anthropic-messages) behind the uniform event stream.
 *
 * Tool execution, approvals and multi-round loops stay in the existing
 * chat-generation path for now; this runtime covers the single-generation
 * contract that other runtimes (coding agents, A2A, …) will also implement.
 */
import type { ApiFormat } from "../../types";
import { getAdapter, type ProviderAdapter } from "../provider-adapters";
import { streamChatToEvents } from "./adapter-to-events";
import type { GenerationEvent } from "./events";
import type { ParticipantRequest, ParticipantRuntime } from "./types";

export class NormalModelRuntime implements ParticipantRuntime {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly resolveAdapter: (apiFormat?: ApiFormat) => ProviderAdapter = getAdapter,
  ) {}

  run(request: ParticipantRequest): AsyncIterable<GenerationEvent> {
    const controllers = this.controllers;

    // Own controller so cancel() can abort the request without touching the
    // caller's signal; the caller's signal is forwarded into it.
    const controller = new AbortController();
    controllers.set(request.runId, controller);
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", () => controller.abort(), { once: true });

    const adapter = this.resolveAdapter(request.apiFormat);
    const stream = streamChatToEvents(
      adapter,
      {
        baseUrl: request.baseUrl,
        headers: request.headers,
        modelId: request.modelId,
        messages: request.messages,
        identity: request.identity,
        reasoningEffort: request.reasoningEffort,
        toolDefs: request.toolDefs,
        signal: controller.signal,
      },
      request.runId,
    );

    return {
      async *[Symbol.asyncIterator]() {
        try {
          yield* stream;
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
