import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const { mockAppFetch } = vi.hoisted(() => ({ mockAppFetch: vi.fn() }));
vi.mock("../../../lib/http", () => ({
  appFetch: mockAppFetch,
}));

import { checkProviderConnection } from "../connection-check";
import type { Provider } from "../../../types";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "OpenAI",
    type: "openai",
    apiFormat: "chat-completions",
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    customHeaders: [],
    enabled: true,
    status: "connected",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("checkProviderConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports all-ok when the endpoint responds with models", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse(200, { data: [{ id: "gpt-4o" }] }));

    const result = await checkProviderConnection(makeProvider(), "gpt-4o");

    expect(result.endpoint.status).toBe("ok");
    expect(result.authentication.status).toBe("ok");
    expect(result.modelDiscovery.status).toBe("ok");
    expect(result.protocolCompatibility.status).toBe("ok");
    expect(result.selectedModelAccess.status).toBe("skipped");
  });

  it("separates endpoint failure from auth failure", async () => {
    mockAppFetch
      .mockRejectedValueOnce(new Error("fetch failed")) // endpoint probe
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" })) // auth
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" })) // discovery
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" })); // protocol

    const result = await checkProviderConnection(makeProvider(), "gpt-4o");

    expect(result.endpoint.status).toBe("fail");
    expect(result.authentication.status).toBe("fail");
    expect(result.authentication.detail).toContain("401");
    // Discovery failing due to auth stays a fail with its own detail.
    expect(result.modelDiscovery.status).toBe("fail");
  });

  it("marks credentials rejected on 403", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse(403, { error: "forbidden" }));

    const result = await checkProviderConnection(makeProvider(), "gpt-4o");

    expect(result.authentication.status).toBe("fail");
    expect(result.authentication.detail).toContain("403");
  });

  it("does not accept 404 or 500 as valid authentication or protocol", async () => {
    mockAppFetch
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(500, {}));

    const result = await checkProviderConnection(makeProvider(), "gpt-4o");
    expect(result.authentication.status).toBe("fail");
    expect(result.protocolCompatibility.status).toBe("fail");
  });

  it("reports empty model lists as discovery failure", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse(200, { data: [] }));

    const result = await checkProviderConnection(makeProvider(), "gpt-4o");

    expect(result.modelDiscovery.status).toBe("fail");
  });

  it("uses the gemini discovery shape for gemini providers", async () => {
    const provider = makeProvider({
      apiFormat: "gemini-generate-content",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    });
    mockAppFetch.mockResolvedValue(
      jsonResponse(200, { models: [{ name: "models/gemini-2.5-flash" }] }),
    );

    const result = await checkProviderConnection(provider, "gemini-2.5-flash");

    expect(result.modelDiscovery.status).toBe("ok");
    expect(result.modelDiscovery.detail).toContain("1 models");
  });

  it("skips discovery for manual-config providers", async () => {
    const provider = makeProvider({ profileId: "anthropic" });
    mockAppFetch.mockResolvedValue(jsonResponse(200, { data: [{ id: "m" }] }));

    const result = await checkProviderConnection(provider);

    expect(result.modelDiscovery.status).toBe("skipped");
  });

  it("uses the Ollama tags discovery endpoint", async () => {
    const provider = makeProvider({
      profileId: "ollama",
      baseUrl: "http://localhost:11434/v1",
    });
    mockAppFetch.mockResolvedValue(jsonResponse(200, { models: [{ name: "llama3.2" }] }));

    const result = await checkProviderConnection(provider);
    expect(result.modelDiscovery.status).toBe("ok");
    expect(mockAppFetch.mock.calls.some(([url]) => String(url).endsWith("/api/tags"))).toBe(true);
  });
});
