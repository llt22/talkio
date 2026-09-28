import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Provider } from "../../types";
import { checkModelHealth, probeProviderModelCapabilities } from "../provider-service";

/**
 * Regression coverage for gateways (Chatbox AI and several proxies) that answer
 * non-streaming requests with an SSE stream anyway. Before the fix, these
 * endpoints were reported as `HTTP 200: data: {...chat.completion.chunk...}`.
 */

interface MockServer {
  url: string;
  requests: string[];
  close: () => Promise<void>;
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server not listening");
  return address.port;
}

async function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<MockServer> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      requests.push(Buffer.concat(chunks).toString());
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${portOf(server)}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function sse(res: ServerResponse, frames: string[], status = 200): void {
  res.writeHead(status, { "content-type": "text/event-stream" });
  res.end(frames.map((frame) => `data: ${frame}\n\n`).join(""));
}

function providerFor(baseUrl: string): Provider {
  return {
    id: "provider-1",
    name: "Chatbox AI",
    type: "openai",
    apiFormat: "chat-completions",
    baseUrl,
    apiKey: "test",
    customHeaders: [],
    enabled: true,
    status: "connected",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("probes against SSE-only gateways", () => {
  let server: MockServer;
  let jsonServer: MockServer;

  beforeAll(async () => {
    server = await startMockServer((req, res) => {
      const toolCall = req.url?.includes("/chat/completions")
        ? `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"test","arguments":"{}"}}]}}]}`
        : "";
      sse(res, [
        `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hi"}}]}`,
        ...(toolCall ? [toolCall] : []),
        `{"object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
        "[DONE]",
      ]);
    });
    jsonServer = await startMockServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
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
        }),
      );
    });
  });

  afterAll(async () => {
    await server.close();
    await jsonServer.close();
  });

  it("reports an SSE-formatted completion as healthy without forcing streaming", async () => {
    const provider = providerFor(server.url);

    await expect(checkModelHealth(provider, "gpt-4o-mini")).resolves.toEqual({ ok: true });
    expect(server.requests.at(-1)).not.toContain('"stream":true');
  });

  it("still accepts a regular JSON completion", async () => {
    await expect(checkModelHealth(providerFor(jsonServer.url), "model-1")).resolves.toEqual({
      ok: true,
    });
  });

  it("surfaces an SSE error frame as a failure", async () => {
    const errorServer = await startMockServer((_req, res) => {
      sse(res, ['{"error":{"message":"invalid api key"}}', "[DONE]"]);
    });
    try {
      const result = await checkModelHealth(providerFor(errorServer.url), "model-1");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("invalid api key");
    } finally {
      await errorServer.close();
    }
  });

  it("still fails on real HTTP errors", async () => {
    const failingServer = await startMockServer((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "upstream down" } }));
    });
    try {
      const result = await checkModelHealth(providerFor(failingServer.url), "model-1");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("HTTP 500");
    } finally {
      await failingServer.close();
    }
  });

  it("detects vision and tool support from SSE responses", async () => {
    const result = await probeProviderModelCapabilities(providerFor(server.url), "gpt-4o-mini");

    expect(result.capabilities).toEqual({ vision: true, toolCall: true });
    expect(result.warnings).toEqual([]);
  });
});
