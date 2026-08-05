import { describe, expect, it } from "vitest";
import { NormalModelRuntime } from "../model-runtime";
import type { GenerationEvent } from "../events";
import type { ApiFormat, ProviderType } from "../../../types";
import { buildProviderHeadersFromRaw } from "../../provider-headers";
import { resolveAdapterBaseUrl } from "../../provider-request";

interface LiveProviderConfig {
  name: string;
  apiFormat: ApiFormat;
  providerType: ProviderType;
  profileId: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  apiVersion?: string;
}

function env(name: string): string {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name]?.trim() ?? "";
}
const providers: LiveProviderConfig[] = [
  {
    name: "OpenAI",
    apiFormat: "responses",
    providerType: "openai",
    profileId: "openai",
    baseUrl: env("TALKIO_LIVE_OPENAI_BASE_URL") || "https://api.openai.com/v1",
    apiKey: env("TALKIO_LIVE_OPENAI_API_KEY"),
    modelId: env("TALKIO_LIVE_OPENAI_MODEL"),
  },
  {
    name: "Anthropic",
    apiFormat: "anthropic-messages",
    providerType: "anthropic",
    profileId: "anthropic",
    baseUrl: env("TALKIO_LIVE_ANTHROPIC_BASE_URL") || "https://api.anthropic.com/v1",
    apiKey: env("TALKIO_LIVE_ANTHROPIC_API_KEY"),
    modelId: env("TALKIO_LIVE_ANTHROPIC_MODEL"),
  },
  {
    name: "Gemini",
    apiFormat: "gemini-generate-content",
    providerType: "gemini",
    profileId: "gemini",
    baseUrl:
      env("TALKIO_LIVE_GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta",
    apiKey: env("TALKIO_LIVE_GEMINI_API_KEY"),
    modelId: env("TALKIO_LIVE_GEMINI_MODEL"),
  },
  {
    name: "Azure OpenAI",
    apiFormat: "chat-completions",
    providerType: "azure-openai",
    profileId: "azure-openai",
    baseUrl: env("TALKIO_LIVE_AZURE_BASE_URL"),
    apiKey: env("TALKIO_LIVE_AZURE_API_KEY"),
    modelId: env("TALKIO_LIVE_AZURE_DEPLOYMENT"),
    apiVersion: env("TALKIO_LIVE_AZURE_API_VERSION") || "2024-10-21",
  },
];

async function collectText(config: LiveProviderConfig): Promise<string> {
  const runtime = new NormalModelRuntime();
  const provider = {
    id: `live-${config.name}`,
    name: config.name,
    type: config.providerType,
    apiFormat: config.apiFormat,
    profileId: config.profileId,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    apiVersion: config.apiVersion,
    customHeaders: [],
    enabled: true,
    status: "connected" as const,
    createdAt: new Date(0).toISOString(),
  };
  const events: GenerationEvent[] = [];
  for await (const event of runtime.run({
    runId: `live-${config.name.toLowerCase().replaceAll(" ", "-")}`,
    apiFormat: config.apiFormat,
    baseUrl: resolveAdapterBaseUrl(provider, config.modelId),
    headers: buildProviderHeadersFromRaw({
      apiKey: config.apiKey,
      customHeaders: [],
      extra: { "Content-Type": "application/json" },
      apiFormat: config.apiFormat,
      profileId: config.profileId,
      providerType: config.providerType,
    }),
    modelId: config.modelId,
    messages: [{ role: "user", content: "Reply with exactly TALKIO_OK and nothing else." }],
    signal: AbortSignal.timeout(60_000),
  })) {
    events.push(event);
  }

  const failed = events.find((event) => event.type === "run-failed");
  if (failed?.type === "run-failed")
    throw new Error(`${failed.error.code}: ${failed.error.message}`);
  return events
    .filter((event) => event.type === "text-delta")
    .map((event) => (event.type === "text-delta" ? event.text : ""))
    .join("")
    .trim();
}

describe("live provider contracts", () => {
  for (const provider of providers) {
    const enabled = Boolean(provider.apiKey && provider.modelId && provider.baseUrl);
    it.skipIf(!enabled)(
      `${provider.name} streams a real response`,
      async () => {
        expect(await collectText(provider)).toContain("TALKIO_OK");
      },
      70_000,
    );
  }
});
