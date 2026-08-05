/**
 * Model catalog — versioned model capability metadata with a user override
 * layer. Priority when resolving a model's metadata:
 *   1. user overrides (localStorage)
 *   2. built-in catalog
 *
 * This mirrors the doc recommendation: prefer known metadata over probing,
 * which costs money and can misjudge capabilities.
 */
import { kvStore } from "../../storage/kv-store";
import type { ModelDescriptor } from "./types";

export const MODEL_CATALOG_VERSION = 1;
const OVERRIDES_KEY = "model-catalog-overrides";
const DEFAULT_PROFILE_ID = "global";

function overrideKey(providerProfileId: string, modelId: string): string {
  return `${providerProfileId}:${modelId}`;
}

export const MODEL_CATALOG: ModelDescriptor[] = [
  // OpenAI (Responses)
  {
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      strictToolSchema: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-4.1",
    displayName: "GPT-4.1",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      strictToolSchema: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-4.1-mini",
    displayName: "GPT-4.1 mini",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-4.1-nano",
    displayName: "GPT-4.1 nano",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-4.5-preview",
    displayName: "GPT-4.5",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "o3",
    displayName: "o3",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "o3-mini",
    displayName: "o3 mini",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "o4-mini",
    displayName: "o4 mini",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-5",
    displayName: "GPT-5",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 400000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      nativeSearch: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-5-mini",
    displayName: "GPT-5 mini",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 400000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-5-nano",
    displayName: "GPT-5 nano",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 400000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "gpt-5.1",
    displayName: "GPT-5.1",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 400000,
    maxOutputTokens: 100000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      nativeSearch: true,
      promptCaching: true,
    },
  },

  // Anthropic
  {
    modelId: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      promptCaching: true,
    },
  },
  {
    modelId: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      promptCaching: true,
    },
  },
  {
    modelId: "claude-opus-4-20250514",
    displayName: "Claude Opus 4",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 200000,
    maxOutputTokens: 64000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },
  {
    modelId: "claude-opus-4-1-20250805",
    displayName: "Claude Opus 4.1",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      promptCaching: true,
    },
  },

  // Google Gemini
  {
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    inputModalities: ["text", "image", "audio", "video", "file"],
    outputModalities: ["text"],
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      nativeSearch: true,
      remoteMcp: true,
    },
  },
  {
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    inputModalities: ["text", "image", "audio", "video", "file"],
    outputModalities: ["text"],
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      nativeSearch: true,
      remoteMcp: true,
    },
  },
  {
    modelId: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
    inputModalities: ["text", "image", "audio", "video", "file"],
    outputModalities: ["text"],
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      structuredOutput: true,
      nativeSearch: true,
    },
  },
  {
    modelId: "gemini-2.5-flash-preview-05-20",
    displayName: "Gemini 2.5 Flash (preview)",
    inputModalities: ["text", "image", "audio", "video", "file"],
    outputModalities: ["text"],
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    capabilities: {
      streaming: true,
      reasoning: true,
      tools: true,
      structuredOutput: true,
      nativeSearch: true,
    },
  },
  {
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    inputModalities: ["text", "image", "audio", "video", "file"],
    outputModalities: ["text"],
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    capabilities: {
      streaming: true,
      reasoning: false,
      tools: true,
      parallelTools: true,
      structuredOutput: true,
      nativeSearch: true,
    },
  },
  {
    modelId: "gemini-2.0-flash-lite",
    displayName: "Gemini 2.0 Flash-Lite",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    capabilities: { streaming: true, reasoning: false, tools: true, structuredOutput: true },
  },

  // DeepSeek
  {
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    capabilities: { streaming: true, reasoning: false, tools: true },
  },
  {
    modelId: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    capabilities: { streaming: true, reasoning: true, tools: false },
  },

  // OpenRouter
  {
    modelId: "openrouter/auto",
    displayName: "OpenRouter Auto",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    capabilities: { streaming: true, reasoning: true, tools: true },
  },

  // Local
  {
    modelId: "llama3.1",
    displayName: "Llama 3.1",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    capabilities: { streaming: true, reasoning: false, tools: false },
  },
  {
    modelId: "qwen2.5",
    displayName: "Qwen 2.5",
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: { streaming: true, reasoning: false, tools: false },
  },
];

export interface ModelCatalogState {
  version: number;
  overrides: Record<string, Partial<ModelDescriptor>>;
}

function loadOverrides(): Record<string, Partial<ModelDescriptor>> {
  const raw = kvStore.getObject<ModelCatalogState>(OVERRIDES_KEY);
  if (!raw || raw.version !== MODEL_CATALOG_VERSION) return {};
  return raw.overrides ?? {};
}

function persistOverrides(overrides: Record<string, Partial<ModelDescriptor>>): void {
  kvStore.setObject(OVERRIDES_KEY, {
    version: MODEL_CATALOG_VERSION,
    overrides,
  } satisfies ModelCatalogState);
}

/** Resolve metadata for a provider/model pair. */
export function resolveModelDescriptor(
  providerProfileId: string,
  modelId?: string,
): ModelDescriptor | undefined {
  const resolvedModelId = modelId ?? providerProfileId;
  const resolvedProfileId = modelId ? providerProfileId : DEFAULT_PROFILE_ID;
  const overrides = loadOverrides();
  const override = overrides[overrideKey(resolvedProfileId, resolvedModelId)];
  const base = MODEL_CATALOG.find((model) => model.modelId === resolvedModelId);
  if (!override) return base;
  if (!base) {
    return {
      modelId: resolvedModelId,
      displayName: resolvedModelId,
      inputModalities: ["text"],
      outputModalities: ["text"],
      ...override,
    } satisfies ModelDescriptor;
  }
  return { ...base, ...override };
}

/** All catalog entries for one provider profile, including override-only models. */
export function getAllModelDescriptors(
  providerProfileId: string = DEFAULT_PROFILE_ID,
): ModelDescriptor[] {
  const overrides = loadOverrides();
  const prefix = `${providerProfileId}:`;
  const merged = MODEL_CATALOG.map((model) => ({
    ...model,
    ...(overrides[overrideKey(providerProfileId, model.modelId)] ?? {}),
  }));
  const builtInIds = new Set(MODEL_CATALOG.map((model) => model.modelId));
  for (const [key, override] of Object.entries(overrides)) {
    if (!key.startsWith(prefix)) continue;
    const modelId = key.slice(prefix.length);
    if (builtInIds.has(modelId)) continue;
    merged.push({
      modelId,
      displayName: modelId,
      inputModalities: ["text"],
      outputModalities: ["text"],
      ...override,
    });
  }
  return merged;
}

/** Upsert a provider-scoped model override; an empty patch removes it. */
export function setModelOverride(
  providerProfileId: string,
  modelId: string,
  patch: Partial<ModelDescriptor>,
): void {
  const overrides = loadOverrides();
  const key = overrideKey(providerProfileId, modelId);
  if (Object.keys(patch).length === 0) delete overrides[key];
  else overrides[key] = patch;
  persistOverrides(overrides);
}

/** Bump the catalog version when built-in metadata changes; resets overrides. */
export function resetModelOverrides(): void {
  kvStore.delete(OVERRIDES_KEY);
}
