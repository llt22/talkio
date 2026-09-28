import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../types";
import { checkModelHealth, probeProviderModelCapabilities } from "../provider-service";

/**
 * Regression coverage for gateways (Chatbox AI and several proxies) that answer
 * non-streaming requests with an SSE stream anyway. Before the fix these
 * endpoints were reported as `HTTP 200: data: {...chat.completion.chunk...}`.
 *
 * The stub stands in for the network layer; the AI SDK request/response handling
 * under test is the real one.
 */

const SSE_CHUNKS = [
  `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hi"}}]}`,
  `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"test","arguments":"{}"}}]}}]}`,
  `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
];

const JSON_COMPLETION = JSON.stringify({
  object: "chat.completion",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "hi",
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "test", arguments: "{}" } },
        ],
      },
      finish_reason: "stop",
    },
  ],
});

function sseBody(frames: string[]): string {
  return frames.map((frame) => `data: ${frame}\n\n`).join("");
}

const provider: Provider = {
  id: "provider-1",
  name: "Chatbox AI",
  type: "openai",
  apiFormat: "chat-completions",
  baseUrl: "https://api.chatboxai.app/v1",
  apiKey: "test",
  customHeaders: [],
  enabled: true,
  status: "connected",
  createdAt: "2026-01-01T00:00:00.000Z",
};

let requestBodies: string[] = [];
let respond: () => Response;

beforeEach(() => {
  requestBodies = [];
  respond = () =>
    new Response(sseBody([...SSE_CHUNKS, "[DONE]"]), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    requestBodies.push(typeof init?.body === "string" ? init.body : "");
    return respond();
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("probes against SSE-only gateways", () => {
  it("reports a streamed completion as healthy without forcing streaming", async () => {
    await expect(checkModelHealth(provider, "gpt-4o-mini")).resolves.toEqual({ ok: true });
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).not.toContain('"stream":true');
  });

  it("still accepts a regular JSON completion", async () => {
    respond = () =>
      new Response(JSON_COMPLETION, {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(checkModelHealth(provider, "model-1")).resolves.toEqual({ ok: true });
  });

  it("surfaces an SSE error frame as a failure", async () => {
    respond = () =>
      new Response(sseBody(['{"error":{"message":"invalid api key"}}', "[DONE]"]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });

    const result = await checkModelHealth(provider, "model-1");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalid api key");
  });

  it("still fails on real HTTP errors", async () => {
    respond = () =>
      new Response(JSON.stringify({ error: { message: "upstream down" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });

    const result = await checkModelHealth(provider, "model-1");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 500");
  });

  it("detects vision and tool support from streamed responses", async () => {
    const result = await probeProviderModelCapabilities(provider, "gpt-4o-mini");

    expect(result.capabilities).toEqual({ vision: true, toolCall: true });
    expect(result.warnings).toEqual([]);
  });
});
