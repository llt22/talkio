import { describe, it, expect, vi } from "vitest";
import { consumeGeminiGenerateContentSse } from "../gemini-sse";
import type { StreamDelta } from "../provider-adapters/types";

const encoder = new TextEncoder();

function sseReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return stream.getReader();
}

const NO_SIGNAL = new AbortController().signal;

describe("consumeGeminiGenerateContentSse", () => {
  it("streams text deltas from candidate parts", async () => {
    const deltas: StreamDelta[] = [];
    const usage = await consumeGeminiGenerateContentSse(
      sseReader([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]},"index":0}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"index":0}]}\n\n',
        "data: [DONE]\n\n",
      ]),
      (d) => deltas.push(d),
      NO_SIGNAL,
    );

    expect(deltas).toEqual([{ content: "Hel" }, { content: "lo" }]);
    expect(usage).toBeNull();
  });

  it("maps functionCall parts to a normalized tool_calls delta", async () => {
    const deltas: StreamDelta[] = [];
    await consumeGeminiGenerateContentSse(
      sseReader([
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"call_1","name":"get_weather","args":{"city":"NYC"}}}]},"index":0}]}\n\n',
        "data: [DONE]\n\n",
      ]),
      (d) => deltas.push(d),
      NO_SIGNAL,
    );

    expect(deltas).toEqual([
      {
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            function: { name: "get_weather", arguments: '{"city":"NYC"}' },
          },
        ],
      },
    ]);
  });

  it("parses usageMetadata into token counts", async () => {
    const usage = await consumeGeminiGenerateContentSse(
      sseReader([
        'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
        "data: [DONE]\n\n",
      ]),
      () => {},
      NO_SIGNAL,
    );

    expect(usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });

  it("throws on embedded API errors", async () => {
    const promise = consumeGeminiGenerateContentSse(
      sseReader(['data: {"error":{"message":"API key not valid"}}\n\n']),
      () => {},
      NO_SIGNAL,
    );

    await expect(promise).rejects.toThrow("API key not valid");
  });

  it("throws when the stream ends without completion", async () => {
    const promise = consumeGeminiGenerateContentSse(
      sseReader(['data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n\n']),
      () => {},
      NO_SIGNAL,
    );

    await expect(promise).rejects.toThrow("Stream interrupted");
  });

  it("aborts reads via the signal", async () => {
    const controller = new AbortController();
    const reader = sseReader(["data: [DONE]\n\n"]);
    const readSpy = vi.spyOn(reader, "read");
    controller.abort();

    const promise = consumeGeminiGenerateContentSse(reader, () => {}, controller.signal);

    await expect(promise).rejects.toThrow(/aborted/i);
    expect(readSpy).not.toHaveBeenCalled();
  });
});
