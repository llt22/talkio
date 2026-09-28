import { describe, expect, it, vi } from "vitest";
import {
  completionFromEventStream,
  createStreamedCompletionFetch,
} from "../streamed-completion-fetch";

const SSE_HEADERS = { "content-type": "text/event-stream" };

function chatRequest(stream?: boolean): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      ...(stream === undefined ? {} : { stream }),
    }),
  };
}

function sseResponse(frames: string[]): Response {
  return new Response(frames.map((frame) => `data: ${frame}\n\n`).join(""), {
    status: 200,
    headers: SSE_HEADERS,
  });
}

describe("completionFromEventStream", () => {
  it("merges content, reasoning and tool call deltas", () => {
    const result = completionFromEventStream(
      [
        `data: {"id":"chat-1","model":"m","choices":[{"index":0,"delta":{"content":"Hel","reasoning_content":"why "}}]}`,
        `data: {"choices":[{"index":0,"delta":{"content":"lo"}}]}`,
        `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"look","arguments":"{\\"q\\""}}]}}]}`,
        `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"up","arguments":":1}"}}]},"finish_reason":"tool_calls"}]}`,
        `data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}`,
        "data: [DONE]",
      ].join("\n\n") + "\n\n",
    );

    expect(result?.kind).toBe("completion");
    const body = JSON.parse(result?.kind === "completion" ? result.body : "{}");
    expect(body.id).toBe("chat-1");
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.choices[0].message).toMatchObject({
      role: "assistant",
      content: "Hello",
      reasoning_content: "why ",
      tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: '{"q":1}' } }],
    });
    expect(body.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
  });

  it("reports an error frame instead of a completion", () => {
    expect(completionFromEventStream(`data: {"error":{"message":"invalid model"}}\n\n`)).toEqual({
      kind: "error",
      message: "invalid model",
    });
  });

  it("ignores bodies that are not chat-completion streams", () => {
    expect(completionFromEventStream("data: not json\n\n")).toBeUndefined();
    expect(
      completionFromEventStream(`data: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n`),
    ).toBeUndefined();
    expect(completionFromEventStream("<html>login</html>")).toBeUndefined();
  });
});

describe("createStreamedCompletionFetch", () => {
  it("turns an SSE answer to a non-streaming request into a JSON completion", async () => {
    const inner = vi.fn(async () =>
      sseResponse([`{"choices":[{"index":0,"delta":{"content":"hi"}}]}`, "[DONE]"]),
    );
    const fetchWithShim = createStreamedCompletionFetch(inner as unknown as typeof fetch);

    const response = await fetchWithShim("https://example.com/chat/completions", chatRequest());

    expect(response.headers.get("content-type")).toBe("application/json");
    const body = await response.json();
    expect(body.choices[0].message.content).toBe("hi");
  });

  it("leaves streaming requests untouched", async () => {
    const streamed = sseResponse([`{"choices":[{"index":0,"delta":{"content":"hi"}}]}`]);
    const inner = vi.fn(async () => streamed);
    const fetchWithShim = createStreamedCompletionFetch(inner as unknown as typeof fetch);

    const response = await fetchWithShim("https://example.com/chat/completions", chatRequest(true));

    expect(response).toBe(streamed);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
  });

  it("leaves JSON answers and error statuses untouched", async () => {
    const json = new Response(`{"choices":[]}`, {
      headers: { "content-type": "application/json" },
    });
    const failed = new Response(`{"error":{"message":"nope"}}`, {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    const inner = vi.fn(async () => json).mockImplementationOnce(async () => json);
    inner.mockImplementationOnce(async () => failed);
    const fetchWithShim = createStreamedCompletionFetch(inner as unknown as typeof fetch);

    expect(await fetchWithShim("https://example.com", chatRequest())).toBe(json);
    expect(await fetchWithShim("https://example.com", chatRequest())).toBe(failed);
  });

  it("surfaces a streamed error frame as an upstream failure", async () => {
    const inner = vi.fn(async () => sseResponse([`{"error":{"message":"quota exceeded"}}`]));
    const fetchWithShim = createStreamedCompletionFetch(inner as unknown as typeof fetch);

    const response = await fetchWithShim("https://example.com/chat/completions", chatRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { message: "quota exceeded" } });
  });

  it("hands back non chat-completion streams unchanged", async () => {
    const inner = vi.fn(async () => sseResponse([`{"type":"message_start"}`]));
    const fetchWithShim = createStreamedCompletionFetch(inner as unknown as typeof fetch);

    const response = await fetchWithShim("https://example.com/chat/completions", chatRequest());

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe(`data: {"type":"message_start"}\n\n`);
  });
});
