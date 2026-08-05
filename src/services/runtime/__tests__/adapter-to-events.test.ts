import { describe, it, expect, vi } from "vitest";
import { streamChatToEvents, classifyError } from "../adapter-to-events";
import type { ProviderAdapter } from "../../provider-adapters";
import type { GenerationEvent } from "../events";

function makeMockAdapter(
  streamChatImpl?: (params: {
    onDelta: (delta: Record<string, unknown>) => void;
    signal: AbortSignal;
  }) => Promise<{ usage: { prompt_tokens: number; completion_tokens: number } | null }>,
): ProviderAdapter {
  const streamChat = vi.fn();
  if (streamChatImpl) streamChat.mockImplementation(streamChatImpl);
  return {
    streamChat: streamChat as unknown as ProviderAdapter["streamChat"],
    chat: vi.fn(),
    probeCapabilities: vi.fn(),
  };
}

async function collect(gen: AsyncIterable<GenerationEvent>): Promise<GenerationEvent[]> {
  const events: GenerationEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const NO_SIGNAL = new AbortController().signal;

describe("streamChatToEvents", () => {
  it("emits run-started first, then text deltas in order, then run-completed", async () => {
    const adapter = makeMockAdapter(async ({ onDelta }) => {
      onDelta({ content: "Hello" });
      onDelta({ content: " world" });
      return { usage: null };
    });

    const events = await collect(
      streamChatToEvents(
        adapter,
        { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
        "run-1",
      ),
    );

    expect(events[0]).toEqual({ type: "run-started", runId: "run-1" });
    expect(events.slice(1, 3)).toEqual([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " world" },
    ]);
    expect(events[events.length - 1]).toEqual({ type: "run-completed", reason: "completed" });
  });

  it("emits thinking deltas alongside text", async () => {
    const adapter = makeMockAdapter(async ({ onDelta }) => {
      onDelta({ reasoning_content: "let me think" });
      onDelta({ content: "Answer" });
      return { usage: null };
    });

    const events = await collect(
      streamChatToEvents(
        adapter,
        { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
        "run-1",
      ),
    );

    expect(events).toContainEqual({ type: "thinking-delta", text: "let me think" });
    expect(events).toContainEqual({ type: "text-delta", text: "Answer" });
  });

  it("emits tool-call-started once per index and streams arguments deltas with a stable callId", async () => {
    const adapter = makeMockAdapter(async ({ onDelta }) => {
      onDelta({
        tool_calls: [
          { index: 0, id: "call_1", function: { name: "get_weather", arguments: '{"ci' } },
        ],
      });
      onDelta({ tool_calls: [{ index: 0, function: { arguments: 'ty":"NYC"}' } }] });
      return { usage: null };
    });

    const events = await collect(
      streamChatToEvents(
        adapter,
        { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
        "run-1",
      ),
    );

    const started = events.filter((e) => e.type === "tool-call-started");
    expect(started).toEqual([{ type: "tool-call-started", callId: "call_1", name: "get_weather" }]);
    const argDeltas = events.filter((e) => e.type === "tool-call-arguments-delta");
    expect(argDeltas).toEqual([
      { type: "tool-call-arguments-delta", callId: "call_1", delta: '{"ci' },
      { type: "tool-call-arguments-delta", callId: "call_1", delta: 'ty":"NYC"}' },
    ]);
  });

  it("falls back to an index-based callId when the stream omits ids", async () => {
    const adapter = makeMockAdapter(async ({ onDelta }) => {
      onDelta({ tool_calls: [{ index: 2, function: { name: "tool", arguments: "{}" } }] });
      return { usage: null };
    });

    const events = await collect(
      streamChatToEvents(
        adapter,
        { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
        "run-1",
      ),
    );

    expect(events).toContainEqual({ type: "tool-call-started", callId: "tc-2", name: "tool" });
  });

  it("emits usage mapped to TokenUsage before run-completed", async () => {
    const adapter = makeMockAdapter(async ({ onDelta }) => {
      onDelta({ content: "hi" });
      return { usage: { prompt_tokens: 12, completion_tokens: 34 } };
    });

    const events = await collect(
      streamChatToEvents(
        adapter,
        { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
        "run-1",
      ),
    );

    expect(events).toContainEqual({ type: "usage", usage: { inputTokens: 12, outputTokens: 34 } });
  });

  it("emits run-failed with auth classification on 401", async () => {
    const adapter = makeMockAdapter(async () => {
      throw new Error("API Error 401: Unauthorized");
    });

    const events = await collect(
      streamChatToEvents(
        adapter,
        { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
        "run-1",
      ),
    );

    expect(events[events.length - 1]).toEqual({
      type: "run-failed",
      error: { code: "auth", message: "API Error 401: Unauthorized", retryable: false },
    });
  });

  it("classifies 429 as retryable rate-limit and 500 as retryable api", () => {
    expect(classifyError(new Error("API Error 429: slow down"), NO_SIGNAL)).toMatchObject({
      code: "rate-limit",
      retryable: true,
    });
    expect(classifyError(new Error("API Error 500: boom"), NO_SIGNAL)).toMatchObject({
      code: "api",
      retryable: true,
    });
    expect(classifyError(new Error("API Error 400: bad"), NO_SIGNAL)).toMatchObject({
      code: "invalid-request",
      retryable: false,
    });
    expect(classifyError(new Error("Network failure"), NO_SIGNAL)).toMatchObject({
      code: "unknown",
      retryable: false,
    });
  });

  it("emits run-failed aborted when the external signal fires", async () => {
    const controller = new AbortController();
    const adapter = makeMockAdapter(
      ({ onDelta, signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          onDelta({ content: "partial" });
        }),
    );

    const gen = streamChatToEvents(
      adapter,
      { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: controller.signal },
      "run-1",
    )[Symbol.asyncIterator]();
    const first = await gen.next();
    controller.abort();

    const events: GenerationEvent[] = [];
    for (let r = first; !r.done; r = await gen.next()) events.push(r.value);
    expect(events[events.length - 1]).toMatchObject({
      type: "run-failed",
      error: { code: "aborted", retryable: false },
    });
  });

  it("aborts the underlying request when the consumer stops early", async () => {
    const captured = { signal: null as AbortSignal | null };
    const adapter = makeMockAdapter(async ({ onDelta, signal }) => {
      captured.signal = signal;
      onDelta({ content: "one" });
      onDelta({ content: "two" });
      return { usage: null };
    });

    const gen = streamChatToEvents(
      adapter,
      { baseUrl: "u", headers: {}, modelId: "m", messages: [], signal: NO_SIGNAL },
      "run-1",
    )[Symbol.asyncIterator]();
    await gen.next(); // run-started
    await gen.next(); // text-delta "one"
    await gen.return(undefined); // consumer stops early

    expect(captured.signal?.aborted).toBe(true);
  });
});
