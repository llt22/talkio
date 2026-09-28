import { afterEach, expect, it, vi } from "vitest";
import { streamText } from "ai";
import { getLanguageModel } from "../ai-sdk-runtime";

afterEach(() => vi.unstubAllGlobals());

it("streams normally when the request asks for streaming", async () => {
  let requestBody = "";
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    requestBody = typeof init?.body === "string" ? init.body : "";
    return new Response(
      [
        `data: {"id":"chat-1","choices":[{"index":0,"delta":{"content":"Hel"}}]}`,
        `data: {"choices":[{"index":0,"delta":{"content":"lo"}}]}`,
        `data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}`,
        "data: [DONE]",
      ]
        .map((frame) => `${frame}\n\n`)
        .join(""),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  });

  const model = getLanguageModel({
    apiFormat: "chat-completions",
    baseUrl: "https://api.chatboxai.app/v1",
    headers: { Authorization: "Bearer test" },
    modelId: "gpt-4o-mini",
  });
  const result = streamText({ model, prompt: "hi", maxRetries: 0 });

  expect(await result.text).toBe("Hello");
  expect(await result.finishReason).toBe("stop");
  expect(requestBody).toContain('"stream":true');
});
