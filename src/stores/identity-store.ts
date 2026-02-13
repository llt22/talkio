import { create } from "zustand";
import type { Identity, McpTool, McpServer } from "../types";
import { getItem, setItem } from "../storage/mmkv";
import { STORAGE_KEYS, DEFAULT_IDENTITY_PARAMS } from "../constants";
import { generateId } from "../utils/id";
import { BUILT_IN_TOOLS, registerBuiltInTools } from "../services/built-in-tools";

interface IdentityState {
  identities: Identity[];
  mcpTools: McpTool[];      // built-in tools only
  mcpServers: McpServer[];  // remote MCP server configs
  initBuiltInTools: () => void;
  loadIdentities: () => void;
  addIdentity: (data: Omit<Identity, "id" | "createdAt">) => Identity;
  updateIdentity: (id: string, updates: Partial<Identity>) => void;
  removeIdentity: (id: string) => void;
  getIdentityById: (id: string) => Identity | undefined;
  // Built-in tool management
  addMcpTool: (data: Omit<McpTool, "id">) => McpTool;
  updateMcpTool: (id: string, updates: Partial<McpTool>) => void;
  removeMcpTool: (id: string) => void;
  getMcpToolById: (id: string) => McpTool | undefined;
  getGlobalTools: () => McpTool[];
  getToolsForIdentity: (identityId: string) => McpTool[];
  // MCP Server management
  addMcpServer: (data: Omit<McpServer, "id">) => McpServer;
  updateMcpServer: (id: string, updates: Partial<McpServer>) => void;
  removeMcpServer: (id: string) => void;
  getMcpServerById: (id: string) => McpServer | undefined;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  identities: [],
  mcpTools: [],
  mcpServers: [],

  initBuiltInTools: () => {
    const existing = get().mcpTools;
    let changed = false;
    const updated = [...existing];

    // Seed any missing built-in tools
    for (const def of BUILT_IN_TOOLS) {
      const found = existing.find((t) => t.builtIn && t.nativeModule === def.nativeModule);
      if (!found) {
        updated.push({ ...def, id: generateId() });
        changed = true;
      }
    }

    if (changed) {
      set({ mcpTools: updated });
      setItem(STORAGE_KEYS.MCP_TOOLS, updated);
    }

    // Register handlers for all built-in tools
    const idMap = new Map<string, string>();
    for (const t of get().mcpTools) {
      if (t.builtIn && t.nativeModule) {
        idMap.set(t.nativeModule, t.id);
      }
    }
    registerBuiltInTools(idMap);
  },

  loadIdentities: () => {
    const identities = getItem<Identity[]>(STORAGE_KEYS.IDENTITIES) ?? [];
    const mcpTools = getItem<McpTool[]>(STORAGE_KEYS.MCP_TOOLS) ?? [];
    const mcpServers = getItem<McpServer[]>(STORAGE_KEYS.MCP_SERVERS) ?? [];
    set({ identities, mcpTools, mcpServers });
  },

  addIdentity: (data) => {
    const identity: Identity = {
      ...data,
      id: generateId(),
      params: { ...DEFAULT_IDENTITY_PARAMS, ...data.params },
      createdAt: new Date().toISOString(),
    };
    const identities = [...get().identities, identity];
    set({ identities });
    setItem(STORAGE_KEYS.IDENTITIES, identities);
    return identity;
  },

  updateIdentity: (id, updates) => {
    const identities = get().identities.map((i) =>
      i.id === id ? { ...i, ...updates } : i,
    );
    set({ identities });
    setItem(STORAGE_KEYS.IDENTITIES, identities);
  },

  removeIdentity: (id) => {
    const identities = get().identities.filter((i) => i.id !== id);
    set({ identities });
    setItem(STORAGE_KEYS.IDENTITIES, identities);
  },

  getIdentityById: (id) => get().identities.find((i) => i.id === id),

  addMcpTool: (data) => {
    const tool: McpTool = { ...data, id: generateId() };
    const mcpTools = [...get().mcpTools, tool];
    set({ mcpTools });
    setItem(STORAGE_KEYS.MCP_TOOLS, mcpTools);
    return tool;
  },

  updateMcpTool: (id, updates) => {
    const mcpTools = get().mcpTools.map((t) =>
      t.id === id ? { ...t, ...updates } : t,
    );
    set({ mcpTools });
    setItem(STORAGE_KEYS.MCP_TOOLS, mcpTools);
  },

  removeMcpTool: (id) => {
    const mcpTools = get().mcpTools.filter((t) => t.id !== id);
    set({ mcpTools });
    setItem(STORAGE_KEYS.MCP_TOOLS, mcpTools);
  },

  getMcpToolById: (id) => get().mcpTools.find((t) => t.id === id),

  getGlobalTools: () =>
    get().mcpTools.filter((t) => t.scope === "global" && t.enabled),

  getToolsForIdentity: (identityId) => {
    const identity = get().getIdentityById(identityId);
    if (!identity) return [];
    return get().mcpTools.filter((t) => identity.mcpToolIds.includes(t.id) && t.enabled);
  },

  // ── MCP Server CRUD ──

  addMcpServer: (data) => {
    const server: McpServer = { ...data, id: generateId() };
    const mcpServers = [...get().mcpServers, server];
    set({ mcpServers });
    setItem(STORAGE_KEYS.MCP_SERVERS, mcpServers);
    return server;
  },

  updateMcpServer: (id, updates) => {
    const mcpServers = get().mcpServers.map((s) =>
      s.id === id ? { ...s, ...updates } : s,
    );
    set({ mcpServers });
    setItem(STORAGE_KEYS.MCP_SERVERS, mcpServers);
  },

  removeMcpServer: (id) => {
    const mcpServers = get().mcpServers.filter((s) => s.id !== id);
    set({ mcpServers });
    setItem(STORAGE_KEYS.MCP_SERVERS, mcpServers);
  },

  getMcpServerById: (id) => get().mcpServers.find((s) => s.id === id),
}));
