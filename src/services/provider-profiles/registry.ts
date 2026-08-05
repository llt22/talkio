/**
 * Provider preset registry — data-driven provider definitions.
 *
 * Adding a provider family here is a data change, not a code change:
 * endpoint, auth style and model discovery strategy are described, while the
 * actual protocol handling stays in the four protocol adapters.
 */
import type { ProviderProfile } from "./types";

export const PROVIDER_PROFILES: ProviderProfile[] = [
  {
    id: "openai",
    name: "OpenAI",
    protocol: "responses",
    endpoint: { baseUrl: "https://api.openai.com/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
    defaultOptions: {
      openai: { stream_options: { include_usage: true } },
    },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic-messages",
    endpoint: {
      baseUrl: "https://api.anthropic.com",
      headers: { "anthropic-version": "2023-06-01" },
    },
    auth: { type: "header", name: "x-api-key", secretRef: "" },
    modelDiscovery: { type: "manual" },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    protocol: "gemini-generate-content",
    endpoint: { baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
    auth: { type: "header", name: "x-goog-api-key", secretRef: "" },
    modelDiscovery: { type: "gemini-models" },
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    protocol: "chat-completions",
    endpoint: { baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai" },
    auth: { type: "azure-api-key", secretRef: "" },
    modelDiscovery: { type: "manual" },
    defaultOptions: {
      openai: { stream_options: { include_usage: true } },
    },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "chat-completions",
    endpoint: { baseUrl: "https://openrouter.ai/api/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
    defaultOptions: {
      openrouter: { include_usage: true },
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    protocol: "chat-completions",
    endpoint: { baseUrl: "https://api.deepseek.com/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
  },
  {
    id: "groq",
    name: "Groq",
    protocol: "chat-completions",
    endpoint: { baseUrl: "https://api.groq.com/openai/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
  },
  {
    id: "together",
    name: "Together AI",
    protocol: "chat-completions",
    endpoint: { baseUrl: "https://api.together.xyz/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    protocol: "chat-completions",
    endpoint: { baseUrl: "https://api.fireworks.ai/inference/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
  },
  {
    id: "ollama",
    name: "Ollama",
    protocol: "chat-completions",
    endpoint: { baseUrl: "http://localhost:11434/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "ollama-tags" },
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    protocol: "chat-completions",
    endpoint: { baseUrl: "http://localhost:1234/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
  },
  {
    id: "vllm",
    name: "vLLM",
    protocol: "chat-completions",
    endpoint: { baseUrl: "http://localhost:8000/v1" },
    auth: { type: "bearer", secretRef: "" },
    modelDiscovery: { type: "openai-models" },
  },
];

const profileById = new Map(PROVIDER_PROFILES.map((p) => [p.id, p]));

export function getProfile(profileId: string): ProviderProfile | undefined {
  return profileById.get(profileId);
}

/** Resolve a profile's endpoint base URL, honoring per-user overrides. */
export function resolveBaseUrl(profile: ProviderProfile, override?: string): string {
  return (override ?? profile.endpoint.baseUrl).replace(/\/+$/, "");
}
