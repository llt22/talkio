import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const { mockStreamText } = vi.hoisted(() => ({ mockStreamText: vi.fn() }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: mockStreamText,
  };
});

import { AISdkRuntime, classifyAiSdkError, extractApiKey, toAiSdkTools } from "../ai-sdk-runtime";
import type { GenerationEvent } from "../../events";
import type { ParticipantRequest } from "../../types";

function makeRequest(overrides: Partial<ParticipantRequest> = {}): ParticipantRequest {
  return {
    runId: "run-1",
    apiFormat: "chat-completions",
    baseUrl: "https://api.example.com/v1",
    headers: { Authorization: "Bearer sk-test" },
    modelId: "gpt-4o",
    messages: [{ role: "user", content: "hi" }],
    signal: new AbortController().signal,
    ...overrides,
  };
}

function makeStream(events: Array<Record<string, unknown>>): {
  fullStream: AsyncIterable<Record<string, unknown>>;
  usage: Promise<{ inputTokens: number; outputTokens: number }>;
  finishReason: Promise<string>;
} {
  return {
    fullStream: {
      async *[Symbol.asyncIterator]() {
        for (const e of events) yield e;
      },
    },
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    finishReason: Promise.resolve("stop"),
  };
}

async function collect(gen: AsyncIterable<GenerationEvent>): Promise<GenerationEvent[]> {
  const events: GenerationEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("AISdkRuntime event mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps text and reasoning deltas", async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: "text-delta", id: "t1", text: "Hel" },
        { type: "reasoning-delta", id: "r1", text: "think" },
        { type: "text-delta", id: "t2", text: "lo" },
        { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 3, outputTokens: 2 } },
      ]),
    );
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events).toEqual([
      { type: "run-started", runId: "run-1" },
      { type: "text-delta", text: "Hel" },
      { type: "thinking-delta", text: "think" },
      { type: "text-delta", text: "lo" },
      { type: "usage", usage: { inputTokens: 3, outputTokens: 2 } },
      { type: "run-completed", reason: "stop" },
    ]);
  });

  it("maps incremental tool input to started + arguments deltas", async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: "tool-input-start", id: "call_1", toolName: "get_weather" },
        { type: "tool-input-delta", id: "call_1", delta: '{"ci' },
        { type: "tool-input-delta", id: "call_1", delta: 'ty":"NYC"}' },
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "get_weather",
          input: { city: "NYC" },
        },
        { type: "finish", finishReason: "tool-calls", totalUsage: undefined },
      ]),
    );
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events).toEqual([
      { type: "run-started", runId: "run-1" },
      { type: "tool-call-started", callId: "call_1", name: "get_weather" },
      { type: "tool-call-arguments-delta", callId: "call_1", delta: '{"ci' },
      { type: "tool-call-arguments-delta", callId: "call_1", delta: 'ty":"NYC"}' },
      { type: "run-completed", reason: "tool-calls" },
    ]);
  });

  it("emits a complete tool call as started + full arguments when no deltas streamed", async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: "tool-call", toolCallId: "call_1", toolName: "calc", input: { a: 1 } },
        { type: "finish", finishReason: "tool-calls", totalUsage: undefined },
      ]),
    );
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events).toEqual([
      { type: "run-started", runId: "run-1" },
      { type: "tool-call-started", callId: "call_1", name: "calc" },
      { type: "tool-call-arguments-delta", callId: "call_1", delta: '{"a":1}' },
      { type: "run-completed", reason: "tool-calls" },
    ]);
  });

  it("maps error events to run-failed", async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: "text-delta", id: "t1", text: "partial" },
        { type: "error", error: new Error("API Error 429: slow down") },
      ]),
    );
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events[events.length - 1]).toEqual({
      type: "run-failed",
      error: { code: "rate-limit", message: "API Error 429: slow down", retryable: true },
    });
  });

  it("maps abort to run-failed aborted", async () => {
    mockStreamText.mockReturnValue(
      makeStream([{ type: "text-delta", id: "t1", text: "partial" }, { type: "abort" }]),
    );
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events[events.length - 1]).toEqual({
      type: "run-failed",
      error: { code: "aborted", message: "Run cancelled", retryable: false },
    });
  });

  it("throws from the stream are normalized to run-failed", async () => {
    mockStreamText.mockReturnValue({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          throw new Error("API Error 401: nope");
        },
      },
      usage: Promise.resolve(null),
      finishReason: Promise.resolve("error"),
    });
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events[events.length - 1]).toEqual({
      type: "run-failed",
      error: { code: "auth", message: "API Error 401: nope", retryable: false },
    });
  });

  it("settles with usage and finishReason when the stream has no finish event", async () => {
    mockStreamText.mockReturnValue(makeStream([{ type: "text-delta", id: "t1", text: "hi" }]));
    const runtime = new AISdkRuntime(() => ({}) as never);

    const events = await collect(runtime.run(makeRequest()));

    expect(events).toEqual([
      { type: "run-started", runId: "run-1" },
      { type: "text-delta", text: "hi" },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } },
      { type: "run-completed", reason: "stop" },
    ]);
  });

  it("cancel aborts the underlying stream", async () => {
    const captured = { signal: null as AbortSignal | null };
    mockStreamText.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      captured.signal = abortSignal;
      return {
        fullStream: {
          async *[Symbol.asyncIterator]() {
            yield { type: "text-delta", id: "t1", text: "hi" };
            await new Promise((_resolve, reject) => {
              abortSignal.addEventListener("abort", () =>
                reject(new DOMException("aborted", "AbortError")),
              );
            });
          },
        },
        usage: Promise.resolve(null),
        finishReason: Promise.resolve("error"),
      };
    });
    const runtime = new AISdkRuntime(() => ({}) as never);

    const gen = runtime.run(makeRequest())[Symbol.asyncIterator]();
    await gen.next(); // run-started
    await gen.next(); // text-delta "hi"
    const pending = gen.next(); // enters the abort wait
    await runtime.cancel("run-1");
    const next = await pending;

    expect(captured.signal?.aborted).toBe(true);
    expect(next.value).toMatchObject({ type: "run-failed", error: { code: "aborted" } });
  });
});

describe("AISdkRuntime helpers", () => {
  it("extractApiKey reads Bearer, x-api-key and x-goog-api-key", () => {
    expect(extractApiKey({ Authorization: "Bearer abc" })).toBe("abc");
    expect(extractApiKey({ "x-api-key": "xyz" })).toBe("xyz");
    expect(extractApiKey({ "x-goog-api-key": "g" })).toBe("g");
    expect(extractApiKey({})).toBeUndefined();
  });

  it("toAiSdkTools converts OpenAI function defs", () => {
    const tools = toAiSdkTools([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object" },
        },
      },
      { type: "function", function: { description: "no name" } },
    ]);
    expect(Object.keys(tools)).toEqual(["get_weather"]);
  });

  it("classifyAiSdkError covers the error classes", () => {
    expect(
      classifyAiSdkError(new Error("429 Too Many Requests"), new AbortController().signal).code,
    ).toBe("rate-limit");
    expect(
      classifyAiSdkError(new Error("401 unauthorized"), new AbortController().signal).code,
    ).toBe("auth");
    expect(
      classifyAiSdkError(new Error("500 server error"), new AbortController().signal).code,
    ).toBe("api");
    const aborted = new AbortController();
    aborted.abort();
    expect(classifyAiSdkError(new Error("anything"), aborted.signal).code).toBe("aborted");
  });
});
