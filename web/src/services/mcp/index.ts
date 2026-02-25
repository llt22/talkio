import type { Identity, McpServer } from "../../../../src/types";
import { useMcpStore, type McpServerConfig, type McpTool } from "../../stores/mcp-store";
import { mcpConnectionManager } from "./connection-manager";

let refreshPromise: Promise<void> | null = null;

function toSharedServer(server: McpServerConfig): McpServer {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    customHeaders: server.customHeaders,
    enabled: server.enabled,
  };
}

export function getMcpToolDefs() {
  const tools = useMcpStore.getState().getAllEnabledTools();
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

export function getMcpToolDefsForIdentity(_identity?: Identity | null) {
  const store = useMcpStore.getState();
  // All globally enabled servers are available to every identity.
  const tools = store.getAllEnabledTools();

  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

export async function refreshMcpConnections(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const store = useMcpStore.getState();
    const servers = store.servers;

    for (const srv of servers) {
      const status = srv.enabled ? "connecting" : "disconnected";
      store.setConnectionStatus(srv.id, status);
      if (!srv.enabled) {
        mcpConnectionManager.reset(srv.id);
        store.setTools(srv.id, []);
      }
    }

    const enabled = servers.filter((s) => s.enabled);
    await Promise.all(
      enabled.map(async (srv) => {
        try {
          const tools = await mcpConnectionManager.discoverTools(toSharedServer(srv));
          useMcpStore.getState().setTools(
            srv.id,
            tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              serverId: t.serverId,
            })),
          );
          useMcpStore.getState().setConnectionStatus(srv.id, "connected");
        } catch {
          useMcpStore.getState().setConnectionStatus(srv.id, "error");
          useMcpStore.getState().setTools(srv.id, []);
        }
      }),
    );
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function executeMcpToolByName(
  toolName: string,
  args: Record<string, unknown>,
  allowedServerIds?: string[],
): Promise<{ success: boolean; content: string; error?: string } | null> {
  const store = useMcpStore.getState();
  let enabledServerIds = new Set(store.servers.filter((s) => s.enabled).map((s) => s.id));
  if (allowedServerIds && allowedServerIds.length > 0) {
    const allowed = new Set(allowedServerIds);
    enabledServerIds = new Set([...enabledServerIds].filter((id) => allowed.has(id)));
  }

  const tool = store.tools.find((t: McpTool) => t.name === toolName && enabledServerIds.has(t.serverId));
  if (!tool) return null;

  const serverCfg = store.servers.find((s: McpServerConfig) => s.id === tool.serverId);
  if (!serverCfg) return null;

  const res = await mcpConnectionManager.callTool(toSharedServer(serverCfg), toolName, args);
  if (!res.success) return { success: false, content: "", error: res.error };
  return { success: true, content: res.content };
}
