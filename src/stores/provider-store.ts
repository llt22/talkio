/**
 * Provider Store — manages AI providers and models.
 * Uses localStorage for persistence (replaces react-native-mmkv).
 */
import { create } from "zustand";
import type { Provider, Model, ModelCapabilities } from "../types";
import { kvStore } from "../storage/kv-store";
import { secretStore } from "../services/secret-store";
import { generateId } from "../lib/id";
import {
  createModelFromProviderPayload,
  fetchProviderModels,
  probeProviderModelCapabilities,
  testProviderConnection,
  checkModelHealth,
} from "../services/provider-service";
import { resolveModelDescriptor } from "../services/provider-profiles/model-catalog";

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
  addProvider: (provider: Provider) => Promise<void>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
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
  checkModelHealth: (modelId: string) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Strip API keys before persisting — keys live in the OS credential store
 * (desktop) or the secret KV namespace (fallback), never in the providers blob.
 */
function stripSecrets(providers: Provider[]): Provider[] {
  return providers.map(({ apiKey: _apiKey, ...rest }) => rest as Provider);
}

function persistProviders(providers: Provider[]) {
  kvStore.setObject(PROVIDERS_KEY, stripSecrets(providers));
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

/**
 * Load secrets into the in-memory Provider objects.
 * Also migrates legacy plaintext keys (pre-P0 builds stored apiKey in the
 * providers blob): they are moved into the secret store and the blob is
 * rewritten without them.
 */
async function hydrateProviderSecrets(providers: Provider[]): Promise<Provider[]> {
  let migrated = false;
  for (const p of providers) {
    if (p.apiKey) {
      await secretStore.set(p.id, p.apiKey);
      migrated = true;
    }
  }
  if (migrated) persistProviders(providers);

  return Promise.all(
    providers.map(async (p) => ({
      ...p,
      apiKey: (await secretStore.get(p.id)) ?? "",
    })),
  );
}

function loadInitial() {
  const providers = kvStore.getObject<Provider[]>(PROVIDERS_KEY) ?? [];
  const rawModels = kvStore.getObject<any[]>(MODELS_KEY) ?? [];
  const models: Model[] = rawModels.map(normalizeModel);
  return { providers, models };
}

export const useProviderStore = create<ProviderState>((set, get) => {
  const initial = loadInitial();

  // Hydrate API keys from the secret store asynchronously after creation.
  queueMicrotask(() => {
    void hydrateProviderSecrets(initial.providers).then((hydrated) => {
      set({ providers: hydrated });
    });
  });

  return {
    ...initial,

    getProviderById: (id) => get().providers.find((p) => p.id === id),
    getModelById: (id) => get().models.find((m) => m.id === id),
    getModelsByProvider: (providerId) => get().models.filter((m) => m.providerId === providerId),
    getEnabledModels: () => {
      const enabledProviderIds = new Set(
        get().providers.filter((p) => p.enabled !== false).map((p) => p.id),
      );
      return get().models.filter(
        (m) => m.enabled && enabledProviderIds.has(m.providerId),
      );
    },

    addProvider: async (provider) => {
      await secretStore.set(provider.id, provider.apiKey);
      set((s) => {
        const providers = [...s.providers, provider];
        persistProviders(providers);
        return { providers };
      });
    },

    updateProvider: async (id, updates) => {
      if (updates.apiKey !== undefined) {
        await secretStore.set(id, updates.apiKey ?? "");
      }
      set((s) => {
        const providers = s.providers.map((p) => (p.id === id ? { ...p, ...updates } : p));
        persistProviders(providers);
        return { providers };
      });
    },


    deleteProvider: async (id) => {
      await secretStore.delete(id);
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
      const existing = get().models.find(
        (m) => m.providerId === providerId && m.modelId === modelId,
      );
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
      void hydrateProviderSecrets(providers).then((hydrated) => {
        set({ providers: hydrated });
      });
    },

    fetchModels: async (providerId: string) => {
      const provider = get().providers.find((p) => p.id === providerId);
      if (!provider) return [];

      const modelList = await fetchProviderModels(provider);

      // Anthropic has no /models endpoint — keep existing models intact
      if (modelList.length === 0) {
        await get().updateProvider(providerId, { status: "connected" });
        return get().models.filter((m) => m.providerId === providerId);
      }

      const existingOther = get().models.filter((m) => m.providerId !== providerId);
      const existingForProvider = get().models.filter((m) => m.providerId === providerId);

      const newModels: Model[] = modelList.map((payload) => {
        const existing = existingForProvider.find((model) => model.modelId === payload.id);
        if (existing) return existing;
        const descriptor = resolveModelDescriptor(provider.profileId ?? provider.id, payload.id);
        const model = createModelFromProviderPayload(
          generateId(),
          providerId,
          payload.id,
          undefined,
          descriptor?.contextWindow ?? payload.context_length ?? 128000,
        );
        if (descriptor?.displayName) model.displayName = descriptor.displayName;
        if (descriptor?.capabilities) {
          model.capabilities = {
            vision: descriptor.inputModalities.includes("image"),
            toolCall: descriptor.capabilities.tools === true,
            reasoning: descriptor.capabilities.reasoning === true,
            streaming: descriptor.capabilities.streaming !== false,
          };
          model.capabilitiesVerified = true;
        }
        return model;
      });

      const allModels = [...existingOther, ...newModels];
      set({ models: allModels });
      persistModels(allModels);
      await get().updateProvider(providerId, { status: "connected" });

      return newModels;
    },

    testConnection: async (providerId: string) => {
      const provider = get().providers.find((p) => p.id === providerId);
      if (!provider) return false;

      try {
        const ok = await testProviderConnection(provider);
        await get().updateProvider(providerId, { status: ok ? "connected" : "error" });
        return ok;
      } catch {
        await get().updateProvider(providerId, { status: "error" });
        return false;
      }
    },


    probeModelCapabilities: async (modelId: string) => {
      const model = get().getModelById(modelId);
      if (!model) throw new Error("Model not found");
      const provider = get().getProviderById(model.providerId);
      if (!provider) throw new Error("Provider not found");

      const caps = await probeProviderModelCapabilities(provider, model.modelId);
      get().updateModelCapabilities(modelId, caps);
    },

    checkModelHealth: async (modelId: string) => {
      const model = get().getModelById(modelId);
      if (!model) return { ok: false, error: "Model not found" };
      const provider = get().getProviderById(model.providerId);
      if (!provider) return { ok: false, error: "Provider not found" };
      return checkModelHealth(provider, model.modelId);
    },
  };
});
