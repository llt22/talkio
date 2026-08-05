import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockAppFetch = vi.fn();
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

    const result = await checkProviderConnection(makeProvider());

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

    const result = await checkProviderConnection(makeProvider());

    expect(result.endpoint.status).toBe("fail");
    expect(result.authentication.status).toBe("fail");
    expect(result.authentication.detail).toContain("401");
    // Discovery failing due to auth stays a fail with its own detail.
    expect(result.modelDiscovery.status).toBe("fail");
  });

  it("marks credentials rejected on 403", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse(403, { error: "forbidden" }));

    const result = await checkProviderConnection(makeProvider());

    expect(result.authentication.status).toBe("fail");
    expect(result.authentication.detail).toContain("403");
  });

  it("reports empty model lists as discovery failure", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse(200, { data: [] }));

    const result = await checkProviderConnection(makeProvider());

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

    const result = await checkProviderConnection(provider);

    expect(result.modelDiscovery.status).toBe("ok");
    expect(result.modelDiscovery.detail).toContain("1 models");
  });

  it("skips discovery for manual-config providers", async () => {
    const provider = makeProvider({ profileId: "anthropic" });
    mockAppFetch.mockResolvedValue(jsonResponse(200, { data: [{ id: "m" }] }));

    const result = await checkProviderConnection(provider);

    expect(result.modelDiscovery.status).toBe("skipped");
  });
});
