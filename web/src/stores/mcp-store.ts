/**
 * MCP Store — manages MCP server connections and tools.
 * Uses localStorage for persistence + runtime connection state.
 */
import { create } from "zustand";
import { kvStore } from "../storage/kv-store";

const MCP_SERVERS_KEY = "mcp_servers";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  createdAt: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
  serverId: string;
}

interface McpState {
  servers: McpServerConfig[];
  tools: McpTool[];
  connectionStatus: Record<string, "disconnected" | "connecting" | "connected" | "error">;

  loadFromStorage: () => void;
  addServer: (data: Omit<McpServerConfig, "id" | "createdAt">) => McpServerConfig;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  deleteServer: (id: string) => void;
  setConnectionStatus: (serverId: string, status: "disconnected" | "connecting" | "connected" | "error") => void;
  setTools: (serverId: string, tools: McpTool[]) => void;
  getToolsByServer: (serverId: string) => McpTool[];
  getAllEnabledTools: () => McpTool[];
}

function persist(servers: McpServerConfig[]) {
  kvStore.setObject(MCP_SERVERS_KEY, servers);
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  tools: [],
  connectionStatus: {},

  loadFromStorage: () => {
    const servers = kvStore.getObject<McpServerConfig[]>(MCP_SERVERS_KEY) ?? [];
    set({ servers });
  },

  addServer: (data) => {
    const server: McpServerConfig = {
      ...data,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const servers = [...s.servers, server];
      persist(servers);
      return { servers };
    });
    return server;
  },

  updateServer: (id, updates) => {
    set((s) => {
      const servers = s.servers.map((srv) => (srv.id === id ? { ...srv, ...updates } : srv));
      persist(servers);
      return { servers };
    });
  },

  deleteServer: (id) => {
    set((s) => {
      const servers = s.servers.filter((srv) => srv.id !== id);
      const tools = s.tools.filter((t) => t.serverId !== id);
      const connectionStatus = { ...s.connectionStatus };
      delete connectionStatus[id];
      persist(servers);
      return { servers, tools, connectionStatus };
    });
  },

  setConnectionStatus: (serverId, status) => {
    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [serverId]: status },
    }));
  },

  setTools: (serverId, newTools) => {
    set((s) => {
      const otherTools = s.tools.filter((t) => t.serverId !== serverId);
      return { tools: [...otherTools, ...newTools] };
    });
  },

  getToolsByServer: (serverId) => get().tools.filter((t) => t.serverId === serverId),
  getAllEnabledTools: () => {
    const enabledServerIds = new Set(get().servers.filter((s) => s.enabled).map((s) => s.id));
    return get().tools.filter((t) => enabledServerIds.has(t.serverId));
  },
}));
