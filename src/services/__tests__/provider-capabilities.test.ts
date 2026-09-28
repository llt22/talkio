import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../types";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getLanguageModel: vi.fn(() => ({})),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("../runtime/ai-sdk/ai-sdk-runtime", () => ({
  getLanguageModel: mocks.getLanguageModel,
}));

import { checkModelHealth, probeProviderModelCapabilities } from "../provider-service";

const provider: Provider = {
  id: "provider-1",
  name: "Compatible",
  type: "openai",
  apiFormat: "chat-completions",
  baseUrl: "https://api.example.com/v1",
  apiKey: "test",
  customHeaders: [],
  enabled: true,
  status: "connected",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("AI SDK model probes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only returns positively confirmed capabilities", async () => {
    mocks.generateText
      .mockRejectedValueOnce(new Error("vision unsupported"))
      .mockResolvedValueOnce({ toolCalls: [{ toolName: "test" }] });

    const result = await probeProviderModelCapabilities(provider, "model-1");

    expect(result.capabilities).toEqual({ toolCall: true });
    expect(result.capabilities).not.toHaveProperty("vision");
    expect(result.capabilities).not.toHaveProperty("reasoning");
    expect(result.warnings).toEqual(["Vision probe failed: vision unsupported"]);
  });

  it("surfaces failures without inventing negative capabilities", async () => {
    mocks.generateText.mockRejectedValue(new Error("network offline"));

    const result = await probeProviderModelCapabilities(provider, "model-1");

    expect(result.capabilities).toEqual({});
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("network offline");
  });

  it("checks model health through the same SDK model resolver", async () => {
    mocks.generateText.mockResolvedValueOnce({ text: "ok" });
    await expect(checkModelHealth(provider, "model-1")).resolves.toEqual({ ok: true });

    mocks.generateText.mockRejectedValueOnce(new Error("unreachable"));
    await expect(checkModelHealth(provider, "model-1")).resolves.toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
