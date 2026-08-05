/**
 * adapter-to-events — bridges the callback-based ProviderAdapter.streamChat
 * into a uniform AsyncIterable<GenerationEvent>.
 *
 * All three protocol adapters (chat-completions / responses / anthropic-messages)
 * share this bridge; a ParticipantRuntime consumes events without knowing the
 * underlying protocol.
 */
import type { ProviderAdapter, StreamChatParams, StreamDelta } from "../provider-adapters";
import type { GenerationEvent, GenerationError } from "./events";
import type { TokenUsage } from "../../types";

/** Classify adapter errors into structured GenerationError. */
export function classifyError(err: unknown, signal: AbortSignal): GenerationError {
  if (signal.aborted) {
    return { code: "aborted", message: "Run cancelled", retryable: false };
  }
  if (err instanceof Error) {
    const match = /API Error (\d{3})/.exec(err.message);
    const status = match ? Number(match[1]) : null;
    if (status !== null) {
      if (status === 401 || status === 403) {
        return { code: "auth", message: err.message, retryable: false };
      }
      if (status === 429) {
        return { code: "rate-limit", message: err.message, retryable: true };
      }
      if (status >= 400 && status < 500) {
        return { code: "invalid-request", message: err.message, retryable: false };
      }
      if (status >= 500) {
        return { code: "api", message: err.message, retryable: true };
      }
    }
    return { code: "unknown", message: err.message, retryable: false };
  }
  return { code: "unknown", message: String(err), retryable: false };
}

/**
 * Convert a callback-driven streamChat call into an event generator.
 *
 * The generator owns an internal AbortController: it forwards the caller's
 * signal, and aborts the underlying request if the consumer stops early.
 */
export async function* streamChatToEvents(
  adapter: ProviderAdapter,
  params: Omit<StreamChatParams, "onDelta" | "signal"> & { signal?: AbortSignal },
  runId: string,
): AsyncGenerator<GenerationEvent> {
  const controller = new AbortController();
  const { signal: externalSignal, ...rest } = params;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const queue: GenerationEvent[] = [];
  let waiter: (() => void) | null = null;
  const wake = () => {
    const w = waiter;
    waiter = null;
    w?.();
  };
  // Resolves when the queue has at least one event. Safe against a wake()
  // that fired before the waiter was installed: the queue is re-checked.
  const waitForEvent = () =>
    new Promise<void>((resolve) => {
      waiter = () => {
        waiter = null;
        resolve();
      };
      if (queue.length > 0) wake();
    });

  const pending = new Map<number, { callId: string; name: string }>();

  yield { type: "run-started", runId };

  if (controller.signal.aborted) {
    // Cancelled before the request could start (e.g. cancel() right after
    // run()): short-circuit instead of starting a request that is already
    // aborted (AbortSignal listeners never fire on an already-aborted signal).
    queue.push({
      type: "run-failed",
      error: { code: "aborted", message: "Run cancelled", retryable: false },
    });
    wake();
  } else {
    adapter
      .streamChat({
        ...rest,
        signal: controller.signal,
        onDelta: (delta: StreamDelta) => {
          if (delta.content) {
            queue.push({ type: "text-delta", text: delta.content });
            wake();
          }
          if (delta.reasoning_content) {
            queue.push({ type: "thinking-delta", text: delta.reasoning_content });
            wake();
          }
          for (const tc of delta.tool_calls ?? []) {
            const index = tc.index ?? 0;
            let entry = pending.get(index);
            if (!entry) {
              const callId = tc.id ?? `tc-${index}`;
              entry = { callId, name: tc.function?.name ?? "" };
              pending.set(index, entry);
              queue.push({ type: "tool-call-started", callId, name: entry.name });
              wake();
            }
            if (tc.function?.name) entry.name += tc.function.name;
            if (tc.function?.arguments) {
              queue.push({
                type: "tool-call-arguments-delta",
                callId: entry.callId,
                delta: tc.function.arguments,
              });
              wake();
            }
          }
        },
      })
      .then(
        (result) => {
          if (result.usage) {
            const usage: TokenUsage = {
              inputTokens: result.usage.prompt_tokens,
              outputTokens: result.usage.completion_tokens,
            };
            queue.push({ type: "usage", usage });
            wake();
          }
          queue.push({ type: "run-completed", reason: "completed" });
          wake();
        },
        (err: unknown) => {
          queue.push({ type: "run-failed", error: classifyError(err, controller.signal) });
          wake();
        },
      );
  }

  try {
    while (true) {
      while (queue.length === 0) await waitForEvent();
      const event = queue.shift() as GenerationEvent;
      yield event;
      if (event.type === "run-completed" || event.type === "run-failed") return;
    }
  } finally {
    // Consumer stopped early (break/return) — cancel the underlying request.
    controller.abort();
  }
}
