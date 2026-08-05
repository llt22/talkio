import { describe, it, expect } from "vitest";
import { PROVIDER_PROFILES, getProfile, resolveBaseUrl } from "../registry";

describe("provider profile registry", () => {
  it("covers the documented provider families", () => {
    const ids = PROVIDER_PROFILES.map((p) => p.id);
    for (const id of [
      "openai",
      "anthropic",
      "gemini",
      "azure-openai",
      "openrouter",
      "deepseek",
      "groq",
      "together",
      "fireworks",
      "ollama",
      "lm-studio",
      "vllm",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("only references the four supported protocols", () => {
    const protocols = new Set(PROVIDER_PROFILES.map((p) => p.protocol));
    expect(protocols).toEqual(
      new Set(["chat-completions", "responses", "anthropic-messages", "gemini-generate-content"]),
    );
  });

  it("every profile has a valid auth config", () => {
    for (const p of PROVIDER_PROFILES) {
      expect(p.auth.type).toMatch(/^(bearer|header|query|azure-api-key|oauth|aws-sigv4)$/);
      if (p.auth.type === "header") expect(p.auth.name).toBeTruthy();
    }
  });

  it("anthropic sends the version header by default", () => {
    const anthropic = getProfile("anthropic");
    expect(anthropic?.endpoint.headers?.["anthropic-version"]).toBe("2023-06-01");
  });

  it("ollama discovers via ollama-tags, anthropic via manual", () => {
    expect(getProfile("ollama")?.modelDiscovery.type).toBe("ollama-tags");
    expect(getProfile("anthropic")?.modelDiscovery.type).toBe("manual");
  });

  it("resolveBaseUrl trims trailing slashes and prefers the override", () => {
    const profile = getProfile("deepseek")!;
    expect(resolveBaseUrl(profile)).toBe("https://api.deepseek.com/v1");
    expect(resolveBaseUrl(profile, "https://example.com/v1/")).toBe("https://example.com/v1");
  });
});
