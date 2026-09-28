import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../types";
import { checkModelHealth, probeProviderModelCapabilities } from "../provider-service";
import { generateIdentityDraft } from "../identity-generation";
import { compressIfNeeded } from "../../lib/context-compression";

/**
 * Regression coverage for OpenAI-compatible gateways that keep streaming no
 * matter what the request asks for (Chatbox AI and several proxies).
 *
 * They answer non-streaming requests with an SSE body, which the AI SDK parses as
 * JSON, so a healthy endpoint used to be reported as
 * `HTTP 200: data: {"object":"chat.completion.chunk", ...}`. The transport shim in
 * `runtime/ai-sdk/streamed-completion-fetch.ts` normalizes that at the fetch
 * layer, which covers every non-streaming call path.
 *
 * The network layer is stubbed; the AI SDK request/response handling under test is
 * the real one.
 */

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

function sseResponse(text: string): Response {
  return new Response(
    [
      `data: {"id":"chat-1","model":"m","choices":[{"index":0,"delta":{"content":${JSON.stringify(text)}}}]}`,
      `data: {"choices":[{"index":0,"delta":{"content":"","tool_calls":[{"index":0,"id":"call_1","function":{"name":"test","arguments":"{}"}}]}}]}`,
      `data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
      "data: [DONE]",
    ]
      .map((frame) => `${frame}\n\n`)
      .join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

let requestBodies: string[] = [];
let respond: () => Response;

beforeEach(() => {
  requestBodies = [];
  respond = () => sseResponse("hi");
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    requestBodies.push(typeof init?.body === "string" ? init.body : "");
    return respond();
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("non-streaming requests against SSE-only gateways", () => {
  it("reports a streamed completion as healthy without forcing streaming", async () => {
    await expect(checkModelHealth(provider, "gpt-4o-mini")).resolves.toEqual({ ok: true });
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).not.toContain('"stream":true');
  });

  it("detects vision and tool support from streamed responses", async () => {
    const result = await probeProviderModelCapabilities(provider, "gpt-4o-mini");

    expect(result.capabilities).toEqual({ vision: true, toolCall: true });
    expect(result.warnings).toEqual([]);
  });

  it("generates an identity draft from a streamed response", async () => {
    const payload = JSON.stringify({ name: "Test", icon: "robot", systemPrompt: "You help." });
    respond = () => sseResponse(payload);

    await expect(
      generateIdentityDraft(provider, "gpt-4o-mini", "a test assistant"),
    ).resolves.toEqual({ name: "Test", icon: "robot", systemPrompt: "You help." });
  });

  it("compresses long context from a streamed response", async () => {
    respond = () => sseResponse("SUMMARY");
    const messages = Array.from({ length: 40 }, (_, index) => ({
      role: "user",
      content: `message ${index} ${"x".repeat(200)}`,
    }));

    const result = await compressIfNeeded(messages, {
      maxTokens: 100,
      baseUrl: provider.baseUrl,
      headers: { Authorization: "Bearer test" },
      model: "gpt-4o-mini",
      apiFormat: "chat-completions",
    });

    expect(result.compressed).toBe(true);
    expect(JSON.stringify(result.messages)).toContain("SUMMARY");
  });

  it("still accepts a regular JSON completion", async () => {
    respond = () =>
      new Response(
        JSON.stringify({
          object: "chat.completion",
          choices: [
            { index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(checkModelHealth(provider, "model-1")).resolves.toEqual({ ok: true });
  });

  it("surfaces an SSE error frame as a failure", async () => {
    respond = () =>
      new Response(`data: {"error":{"message":"invalid api key"}}\n\n`, {
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
});
