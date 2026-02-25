/**
 * Provider Store — manages AI providers and models.
 * Uses localStorage for persistence (replaces react-native-mmkv).
 */
import { create } from "zustand";
import type { Provider, Model, ModelCapabilities } from "../../../src/types";
import { kvStore } from "../storage/kv-store";
import { generateId } from "../lib/id";

const PROVIDERS_KEY = "providers";
const MODELS_KEY = "models";

interface ProviderState {
  providers: Provider[];
  models: Model[];

  // Lookups
  getProviderById: (id: string) => Provider | undefined;
  getModelById: (id: string) => Model | undefined;
  getModelsByProvider: (providerId: string) => Model[];
  getEnabledModels: () => Model[];

  // Actions
  addProvider: (provider: Provider) => void;
  updateProvider: (id: string, updates: Partial<Provider>) => void;
  deleteProvider: (id: string) => void;
  addModel: (model: Model) => void;
  addModelById: (providerId: string, modelId: string) => Model;
  updateModel: (id: string, updates: Partial<Model>) => void;
  toggleModel: (id: string) => void;
  setProviderModelsEnabled: (providerId: string, enabled: boolean) => void;
  updateModelCapabilities: (id: string, caps: Partial<ModelCapabilities>) => void;
  deleteModel: (id: string) => void;
  setModels: (models: Model[]) => void;
  loadFromStorage: () => void;
  fetchModels: (providerId: string) => Promise<Model[]>;
  testConnection: (providerId: string) => Promise<boolean>;
  probeModelCapabilities: (modelId: string) => Promise<void>;
}

function persistProviders(providers: Provider[]) {
  kvStore.setObject(PROVIDERS_KEY, providers);
}

function persistModels(models: Model[]) {
  kvStore.setObject(MODELS_KEY, models);
}

function normalizeModel(m: any): Model {
  const legacyCaps = m.capabilities ?? {};
  const caps: ModelCapabilities = {
    vision: !!legacyCaps.vision,
    toolCall: !!(legacyCaps.toolCall ?? legacyCaps.toolUse),
    reasoning: !!legacyCaps.reasoning,
    streaming: legacyCaps.streaming !== false,
  };
  return {
    id: String(m.id),
    providerId: String(m.providerId),
    modelId: String(m.modelId),
    displayName: String(m.displayName ?? m.modelId),
    avatar: m.avatar ?? null,
    capabilities: caps,
    capabilitiesVerified: !!m.capabilitiesVerified,
    maxContextLength: typeof m.maxContextLength === "number" ? m.maxContextLength : 128000,
    enabled: m.enabled !== false,
  } as Model;
}

function loadInitial() {
  const providers = kvStore.getObject<Provider[]>(PROVIDERS_KEY) ?? [];
  const rawModels = kvStore.getObject<any[]>(MODELS_KEY) ?? [];
  const models: Model[] = rawModels.map(normalizeModel);
  return { providers, models };
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  ...loadInitial(),

  getProviderById: (id) => get().providers.find((p) => p.id === id),
  getModelById: (id) => get().models.find((m) => m.id === id),
  getModelsByProvider: (providerId) => get().models.filter((m) => m.providerId === providerId),
  getEnabledModels: () => get().models.filter((m) => m.enabled),

  addProvider: (provider) => {
    set((s) => {
      const providers = [...s.providers, provider];
      persistProviders(providers);
      return { providers };
    });
  },

  updateProvider: (id, updates) => {
    set((s) => {
      const providers = s.providers.map((p) => (p.id === id ? { ...p, ...updates } : p));
      persistProviders(providers);
      return { providers };
    });
  },

  deleteProvider: (id) => {
    set((s) => {
      const providers = s.providers.filter((p) => p.id !== id);
      const models = s.models.filter((m) => m.providerId !== id);
      persistProviders(providers);
      persistModels(models);
      return { providers, models };
    });
  },

  addModel: (model) => {
    set((s) => {
      const models = [...s.models, model];
      persistModels(models);
      return { models };
    });
  },

  addModelById: (providerId, modelId) => {
    const existing = get().models.find((m) => m.providerId === providerId && m.modelId === modelId);
    if (existing) return existing;

    const model: Model = {
      id: generateId(),
      providerId,
      modelId,
      displayName: modelId,
      avatar: null,
      capabilities: {
        vision: false,
        toolCall: false,
        reasoning: false,
        streaming: true,
      },
      capabilitiesVerified: false,
      maxContextLength: 128000,
      enabled: true,
    };

    get().addModel(model);
    return model;
  },

  updateModel: (id, updates) => {
    set((s) => {
      const models = s.models.map((m) => (m.id === id ? { ...m, ...updates } : m));
      persistModels(models);
      return { models };
    });
  },

  toggleModel: (id) => {
    const m = get().getModelById(id);
    if (!m) return;
    get().updateModel(id, { enabled: !m.enabled });
  },

  setProviderModelsEnabled: (providerId, enabled) => {
    set((s) => {
      const models = s.models.map((m) => (m.providerId === providerId ? { ...m, enabled } : m));
      persistModels(models);
      return { models };
    });
  },

  updateModelCapabilities: (id, caps) => {
    const m = get().getModelById(id);
    if (!m) return;
    get().updateModel(id, {
      capabilities: { ...m.capabilities, ...caps },
      capabilitiesVerified: true,
    });
  },

  deleteModel: (id) => {
    set((s) => {
      const models = s.models.filter((m) => m.id !== id);
      persistModels(models);
      return { models };
    });
  },

  setModels: (models) => {
    set({ models });
    persistModels(models);
  },

  loadFromStorage: () => {
    const providers = kvStore.getObject<Provider[]>(PROVIDERS_KEY) ?? [];
    const rawModels = kvStore.getObject<any[]>(MODELS_KEY) ?? [];
    const models: Model[] = rawModels.map(normalizeModel);
    set({ providers, models });
  },

  fetchModels: async (providerId: string) => {
    const provider = get().providers.find((p) => p.id === providerId);
    if (!provider) return [];

    const baseUrl = provider.baseUrl.replace(/\/+$/, "");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${provider.apiKey}`,
    };
    if (provider.customHeaders) {
      for (const h of provider.customHeaders) {
        if (h.name && h.value) headers[h.name] = h.value;
      }
    }

    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);

    const json = await res.json();
    const modelList: any[] = json.data ?? json ?? [];

    // Remove existing models for this provider
    const existingOther = get().models.filter((m) => m.providerId !== providerId);
    const existingForProvider = get().models.filter((m) => m.providerId === providerId);

    const newModels: Model[] = modelList.map((m: any) => {
      const existing = existingForProvider.find((e) => e.modelId === m.id);
      if (existing) return existing;
      return {
        id: generateId(),
        providerId,
        modelId: m.id,
        displayName: m.id,
        avatar: null,
        enabled: true,
        capabilities: {
          vision: false,
          toolCall: false,
          reasoning: false,
          streaming: true,
        },
        capabilitiesVerified: false,
        maxContextLength: m.context_length ?? 128000,
      } as Model;
    });

    const allModels = [...existingOther, ...newModels];
    set({ models: allModels });
    persistModels(allModels);

    // Update provider status
    get().updateProvider(providerId, { status: "connected" });

    return newModels;
  },

  testConnection: async (providerId: string) => {
    const provider = get().providers.find((p) => p.id === providerId);
    if (!provider) return false;

    const baseUrl = provider.baseUrl.replace(/\/+$/, "");

    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      const ok = res.ok;
      get().updateProvider(providerId, { status: ok ? "connected" : "error" });
      return ok;
    } catch {
      get().updateProvider(providerId, { status: "error" });
      return false;
    }
  },

  probeModelCapabilities: async (modelId: string) => {
    const model = get().getModelById(modelId);
    if (!model) throw new Error("Model not found");
    const provider = get().getProviderById(model.providerId);
    if (!provider) throw new Error("Provider not found");

    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    };
    if (provider.customHeaders) {
      for (const h of provider.customHeaders) {
        if (h.name && h.value) headers[h.name] = h.value;
      }
    }

    const caps = { vision: false, toolCall: false, reasoning: false, streaming: true };

    // Probe vision: send an image in the message
    try {
      const visionRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: model.modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: [{ type: "text", text: "hi" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" } }] }],
        }),
      });
      caps.vision = visionRes.ok;
    } catch { /* ignore */ }

    // Probe tool call
    try {
      const toolRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: model.modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
          tools: [{ type: "function", function: { name: "test", description: "test", parameters: { type: "object", properties: {} } } }],
        }),
      });
      caps.toolCall = toolRes.ok;
    } catch { /* ignore */ }

    get().updateModelCapabilities(modelId, caps);
  },
}));
