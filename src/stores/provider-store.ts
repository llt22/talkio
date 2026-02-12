import { create } from "zustand";
import type { Provider, Model, ModelCapabilities } from "../types";
import { getItem, setItem } from "../storage/mmkv";
import { STORAGE_KEYS } from "../constants";
import { generateId } from "../utils/id";
import { inferCapabilities, inferMaxContext } from "../utils/capability-detector";
import { prettifyModelName } from "../utils/model-name";
import { ApiClient } from "../services/api-client";

interface ProviderState {
  providers: Provider[];
  models: Model[];
  loadProviders: () => void;
  addProvider: (data: Omit<Provider, "id" | "status" | "createdAt" | "enabled" | "customHeaders"> & Partial<Pick<Provider, "enabled" | "customHeaders">>) => Provider;
  updateProvider: (id: string, updates: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  fetchModels: (providerId: string) => Promise<Model[]>;
  addModel: (providerId: string, modelId: string) => Model;
  toggleModel: (modelId: string) => void;
  setProviderModelsEnabled: (providerId: string, enabled: boolean) => void;
  updateModelCapabilities: (modelId: string, caps: Partial<ModelCapabilities>) => void;
  probeModelCapabilities: (modelId: string) => Promise<ModelCapabilities>;
  getProviderById: (id: string) => Provider | undefined;
  getModelById: (id: string) => Model | undefined;
  getModelsByProvider: (providerId: string) => Model[];
  getEnabledModels: () => Model[];
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  models: [],

  loadProviders: () => {
    const providers = getItem<Provider[]>(STORAGE_KEYS.PROVIDERS) ?? [];
    const models = getItem<Model[]>(STORAGE_KEYS.MODELS) ?? [];
    set({ providers, models });
  },

  addProvider: (data) => {
    const provider: Provider = {
      ...data,
      id: generateId(),
      enabled: data.enabled ?? true,
      customHeaders: data.customHeaders ?? [],
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const providers = [...get().providers, provider];
    set({ providers });
    setItem(STORAGE_KEYS.PROVIDERS, providers);
    return provider;
  },

  updateProvider: (id, updates) => {
    const providers = get().providers.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    );
    set({ providers });
    setItem(STORAGE_KEYS.PROVIDERS, providers);
  },

  removeProvider: (id) => {
    const providers = get().providers.filter((p) => p.id !== id);
    const models = get().models.filter((m) => m.providerId !== id);
    set({ providers, models });
    setItem(STORAGE_KEYS.PROVIDERS, providers);
    setItem(STORAGE_KEYS.MODELS, models);
  },

  testConnection: async (id) => {
    const provider = get().getProviderById(id);
    if (!provider) return false;

    const client = new ApiClient(provider);
    const connected = await client.testConnection();
    get().updateProvider(id, {
      status: connected ? "connected" : "error",
    });
    return connected;
  },

  fetchModels: async (providerId) => {
    const provider = get().getProviderById(providerId);
    if (!provider) return [];

    const client = new ApiClient(provider);
    const rawModels = await client.listModels();

    const existingModels = get().models.filter((m) => m.providerId !== providerId);
    const newModels: Model[] = rawModels.map((raw) => {
      const existing = get().models.find(
        (m) => m.providerId === providerId && m.modelId === raw.id,
      );
      return {
        id: existing?.id ?? generateId(),
        providerId,
        modelId: raw.id,
        displayName: prettifyModelName(raw.id),
        avatar: null,
        capabilities: existing?.capabilitiesVerified
          ? existing.capabilities
          : inferCapabilities(raw.id),
        capabilitiesVerified: existing?.capabilitiesVerified ?? false,
        maxContextLength: existing?.maxContextLength ?? inferMaxContext(raw.id),
        enabled: existing?.enabled ?? true,
      };
    });

    const models = [...existingModels, ...newModels];
    set({ models });
    setItem(STORAGE_KEYS.MODELS, models);
    return newModels;
  },

  addModel: (providerId, modelId) => {
    const existing = get().models.find(
      (m) => m.providerId === providerId && m.modelId === modelId,
    );
    if (existing) return existing;

    const model: Model = {
      id: generateId(),
      providerId,
      modelId,
      displayName: prettifyModelName(modelId),
      avatar: null,
      capabilities: inferCapabilities(modelId),
      capabilitiesVerified: false,
      maxContextLength: inferMaxContext(modelId),
      enabled: true,
    };
    const models = [...get().models, model];
    set({ models });
    setItem(STORAGE_KEYS.MODELS, models);
    return model;
  },

  toggleModel: (modelId) => {
    const models = get().models.map((m) =>
      m.id === modelId ? { ...m, enabled: !m.enabled } : m,
    );
    set({ models });
    setItem(STORAGE_KEYS.MODELS, models);
  },

  setProviderModelsEnabled: (providerId, enabled) => {
    const models = get().models.map((m) =>
      m.providerId === providerId ? { ...m, enabled } : m,
    );
    set({ models });
    setItem(STORAGE_KEYS.MODELS, models);
  },

  updateModelCapabilities: (modelId, caps) => {
    const models = get().models.map((m) =>
      m.id === modelId
        ? {
            ...m,
            capabilities: { ...m.capabilities, ...caps },
            capabilitiesVerified: true,
          }
        : m,
    );
    set({ models });
    setItem(STORAGE_KEYS.MODELS, models);
  },

  probeModelCapabilities: async (modelId) => {
    const model = get().getModelById(modelId);
    if (!model) throw new Error("Model not found");

    const provider = get().getProviderById(model.providerId);
    if (!provider) throw new Error("Provider not found");

    const client = new ApiClient(provider);
    const [vision, toolCall, reasoning] = await Promise.all([
      client.probeVision(model.modelId),
      client.probeToolCall(model.modelId),
      client.probeReasoning(model.modelId),
    ]);

    const caps: ModelCapabilities = {
      vision,
      toolCall,
      reasoning,
      streaming: true,
    };

    get().updateModelCapabilities(modelId, caps);
    return caps;
  },

  getProviderById: (id) => get().providers.find((p) => p.id === id),
  getModelById: (id) => get().models.find((m) => m.id === id),
  getModelsByProvider: (providerId) =>
    get().models.filter((m) => m.providerId === providerId),
  getEnabledModels: () => {
    const enabledProviderIds = new Set(
      get().providers.filter((p) => p.enabled !== false).map((p) => p.id),
    );
    return get().models.filter((m) => m.enabled && enabledProviderIds.has(m.providerId));
  },
}));
