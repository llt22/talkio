/**
 * Identity Store — manages system prompt identities (personas).
 * Uses localStorage for persistence.
 */
import { create } from "zustand";
import type { Identity } from "../types";
import { kvStore } from "../storage/kv-store";
import i18n from "../i18n";
import { generateId } from "../lib/id";

const IDENTITIES_KEY = "identities";
const PRESET_VERSION_KEY = "preset_identities_version";

const DEFAULT_IDENTITY_PARAMS = { temperature: 0.7, topP: 0.9 };
const PRESET_IDENTITIES_VERSION = 2;
const PRESET_IDENTITIES = [
  { nameKey: "presets.socrates.name", icon: "research", promptKey: "presets.socrates.prompt" },
  { nameKey: "presets.blunt.name", icon: "security", promptKey: "presets.blunt.prompt" },
  { nameKey: "presets.warm.name", icon: "general", promptKey: "presets.warm.prompt" },
  { nameKey: "presets.minimalist.name", icon: "architecture", promptKey: "presets.minimalist.prompt" },
  { nameKey: "presets.divergent.name", icon: "design", promptKey: "presets.divergent.prompt" },
  { nameKey: "presets.roast.name", icon: "finance", promptKey: "presets.roast.prompt" },
  { nameKey: "presets.humor.name", icon: "marketing", promptKey: "presets.humor.prompt" },
];

interface IdentityState {
  identities: Identity[];

  loadFromStorage: () => void;
  addIdentity: (data: Omit<Identity, "id" | "createdAt">) => Identity;
  updateIdentity: (id: string, updates: Partial<Identity>) => void;
  deleteIdentity: (id: string) => void;
  getIdentityById: (id: string) => Identity | undefined;
}

function persist(identities: Identity[]) {
  kvStore.setObject(IDENTITIES_KEY, identities);
}

function loadInitialIdentities(): Identity[] {
  const saved = kvStore.getObject<Identity[]>(IDENTITIES_KEY) ?? [];
  if (saved.length > 0) return saved;
  // Seed presets if empty
  const seeded = PRESET_IDENTITIES.map((preset) => ({
    id: generateId(),
    name: i18n.t(preset.nameKey),
    icon: preset.icon,
    systemPrompt: i18n.t(preset.promptKey),
    params: { ...DEFAULT_IDENTITY_PARAMS },
    mcpToolIds: [],
    mcpServerIds: [],
    createdAt: new Date().toISOString(),
  } as Identity));
  kvStore.setObject(IDENTITIES_KEY, seeded);
  kvStore.setObject(PRESET_VERSION_KEY, PRESET_IDENTITIES_VERSION);
  return seeded;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  identities: loadInitialIdentities(),

  loadFromStorage: () => {
    let identities = kvStore.getObject<Identity[]>(IDENTITIES_KEY) ?? [];

    // Seed or update preset identities when version changes (same as RN)
    const savedVersion = kvStore.getObject<number>(PRESET_VERSION_KEY) ?? 0;
    if (identities.length === 0 || savedVersion < PRESET_IDENTITIES_VERSION) {
      identities = PRESET_IDENTITIES.map((preset) => ({
        id: generateId(),
        name: i18n.t(preset.nameKey),
        icon: preset.icon,
        systemPrompt: i18n.t(preset.promptKey),
        params: { ...DEFAULT_IDENTITY_PARAMS },
        mcpToolIds: [],
        mcpServerIds: [],
        createdAt: new Date().toISOString(),
      }));
      kvStore.setObject(IDENTITIES_KEY, identities);
      kvStore.setObject(PRESET_VERSION_KEY, PRESET_IDENTITIES_VERSION);
    }

    set({ identities });
  },

  addIdentity: (data) => {
    const identity: Identity = {
      ...data,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const identities = [...s.identities, identity];
      persist(identities);
      return { identities };
    });
    return identity;
  },

  updateIdentity: (id, updates) => {
    set((s) => {
      const identities = s.identities.map((i) => (i.id === id ? { ...i, ...updates } : i));
      persist(identities);
      return { identities };
    });
  },

  deleteIdentity: (id) => {
    set((s) => {
      const identities = s.identities.filter((i) => i.id !== id);
      persist(identities);
      return { identities };
    });
  },

  getIdentityById: (id) => get().identities.find((i) => i.id === id),
}));
