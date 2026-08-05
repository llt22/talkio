import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockAppFetch = vi.fn();
vi.mock("../../../lib/http", () => ({
  appFetch: mockAppFetch,
}));

import { GeminiAdapter } from "../gemini";
import type { StreamChatParams } from "../types";

const encoder = new TextEncoder();

function sseResponse(chunks: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

const NO_SIGNAL = new AbortController().signal;

function makeParams(overrides: Partial<StreamChatParams> = {}): StreamChatParams {
  return {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    headers: { "x-goog-api-key": "key" },
    modelId: "gemini-2.5-flash",
    messages: [{ role: "user", content: "hi" }],
    signal: NO_SIGNAL,
    onDelta: vi.fn(),
    ...overrides,
  };
}

describe("GeminiAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to the native generateContent endpoint with alt=sse", async () => {
    mockAppFetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    const adapter = new GeminiAdapter();
    const params = makeParams();

    await adapter.streamChat(params);

    const [url, init] = mockAppFetch.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?alt=sse",
    );
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "key" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
  });

  it("converts system messages into systemInstruction", async () => {
    mockAppFetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    const adapter = new GeminiAdapter();

    await adapter.streamChat(
      makeParams({
        messages: [
          { role: "system", content: "You are a translator" },
          { role: "user", content: "hello" },
        ],
      }),
    );

    const body = JSON.parse((mockAppFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are a translator" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
  });

  it("converts tool calls and results into functionCall/functionResponse parts", async () => {
    mockAppFetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    const adapter = new GeminiAdapter();

    await adapter.streamChat(
      makeParams({
        messages: [
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "call_1", function: { name: "get_weather", arguments: '{"city":"NYC"}' } },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: "Sunny" },
        ],
      }),
    );

    const body = JSON.parse((mockAppFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "get_weather", args: { city: "NYC" } } }],
    });
    expect(body.contents[2]).toEqual({
      role: "function",
      parts: [{ functionResponse: { name: "call_1", response: { content: "Sunny" } } }],
    });
  });

  it("maps toolDefs to functionDeclarations", async () => {
    mockAppFetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    const adapter = new GeminiAdapter();

    await adapter.streamChat(
      makeParams({
        toolDefs: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather",
              parameters: { type: "object" },
            },
          },
        ],
      }),
    );

    const body = JSON.parse((mockAppFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          { name: "get_weather", description: "Get weather", parameters: { type: "object" } },
        ],
      },
    ]);
  });

  it("sets thinkingConfig from reasoningEffort", async () => {
    mockAppFetch.mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    const adapter = new GeminiAdapter();

    await adapter.streamChat(makeParams({ reasoningEffort: "high" }));

    const body = JSON.parse((mockAppFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig).toEqual({
      thinkingConfig: { thinkingBudget: 24576 },
    });
  });

  it("streams text deltas and returns usage", async () => {
    const onDelta = vi.fn();
    mockAppFetch.mockResolvedValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":2,"totalTokenCount":9}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const adapter = new GeminiAdapter();

    const result = await adapter.streamChat(makeParams({ onDelta }));

    expect(onDelta).toHaveBeenNthCalledWith(1, { content: "Hel" });
    expect(onDelta).toHaveBeenNthCalledWith(2, { content: "lo" });
    expect(result.usage).toEqual({ prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 });
  });

  it("extracts text from non-streaming chat responses", async () => {
    mockAppFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Hello there" }, { text: "!" }] } }],
        }),
        { status: 200 },
      ),
    );
    const adapter = new GeminiAdapter();

    const text = await adapter.chat({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      headers: { "x-goog-api-key": "key" },
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(text).toBe("Hello there!");
  });

  it("probes capabilities heuristically without network calls", async () => {
    const adapter = new GeminiAdapter();
    expect(
      await adapter.probeCapabilities({ baseUrl: "u", headers: {}, modelId: "gemini-2.5-flash" }),
    ).toEqual({ vision: true, toolCall: true, reasoning: true, streaming: true });
    expect(
      await adapter.probeCapabilities({ baseUrl: "u", headers: {}, modelId: "gemini-2.0-flash" }),
    ).toEqual({ vision: true, toolCall: true, reasoning: false, streaming: true });
  });
});
