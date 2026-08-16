import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Provider, Model } from "../../types";

// Node has no localStorage — install a memory stub before any module loads.
vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;
});

function resetStorage() {
  localStorage.clear();
  vi.resetModules();
}

async function loadStore() {
  const { useProviderStore } = await import("../provider-store");
  return useProviderStore;
}

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "OpenAI",
    type: "openai",
    apiFormat: "chat-completions",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-1",
    customHeaders: [],
    enabled: true,
    status: "connected",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: "m1",
    providerId: "p1",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    avatar: null,
    capabilities: { vision: false, toolCall: false, reasoning: false, streaming: true },
    capabilitiesVerified: false,
    maxContextLength: 128000,
    enabled: true,
    ...overrides,
  };
}

describe("provider disable / model selection", () => {
  beforeEach(() => {
    resetStorage();
  });

  it("getEnabledModels hides models from disabled and orphan providers", async () => {
    const store = await loadStore();
    await store.getState().addProvider(makeProvider({ id: "p1" }));
    await store
      .getState()
      .addProvider(makeProvider({ id: "p2", name: "Off", enabled: false }));
    store.getState().addModel(makeModel({ id: "m1", providerId: "p1" }));
    store
      .getState()
      .addModel(
        makeModel({ id: "m2", providerId: "p2", modelId: "off-model", displayName: "Off Model" }),
      );
    store
      .getState()
      .addModel(
        makeModel({ id: "m3", providerId: "ghost", modelId: "ghost-model", displayName: "Ghost" }),
      );

    expect(store.getState().getEnabledModels().map((m) => m.id)).toEqual(["m1"]);
  });
});
