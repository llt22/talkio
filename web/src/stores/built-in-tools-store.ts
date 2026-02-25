import { create } from "zustand";
import { kvStore } from "../storage/kv-store";
import { BUILT_IN_TOOLS } from "../services/built-in-tools";

const BUILT_IN_TOOLS_ENABLED_KEY = "built_in_tools_enabled";

type EnabledMap = Record<string, boolean>;

interface BuiltInToolsState {
  enabledByName: EnabledMap;
  loadFromStorage: () => void;
  setToolEnabled: (name: string, enabled: boolean) => void;
  isToolEnabled: (name: string) => boolean;
}

function buildDefaultEnabledMap(): EnabledMap {
  const map: EnabledMap = {};
  for (const tool of BUILT_IN_TOOLS) {
    map[tool.name] = tool.enabledByDefault !== false;
  }
  return map;
}

export const useBuiltInToolsStore = create<BuiltInToolsState>((set, get) => ({
  enabledByName: buildDefaultEnabledMap(),

  loadFromStorage: () => {
    const saved = kvStore.getObject<EnabledMap>(BUILT_IN_TOOLS_ENABLED_KEY);
    const defaults = buildDefaultEnabledMap();

    const merged: EnabledMap = { ...defaults, ...(saved ?? {}) };

    // Drop stale keys
    const validNames = new Set(Object.keys(defaults));
    for (const k of Object.keys(merged)) {
      if (!validNames.has(k)) delete merged[k];
    }

    set({ enabledByName: merged });
    kvStore.setObject(BUILT_IN_TOOLS_ENABLED_KEY, merged);
  },

  setToolEnabled: (name, enabled) => {
    set((s) => {
      const enabledByName = { ...s.enabledByName, [name]: enabled };
      kvStore.setObject(BUILT_IN_TOOLS_ENABLED_KEY, enabledByName);
      return { enabledByName };
    });
  },

  isToolEnabled: (name) => {
    const v = get().enabledByName[name];
    return v !== false;
  },
}));
