import type { ChatApiToolDef, Identity, McpServer, DiscoveredTool } from "../../types";
import { executeTool, toolToApiDef, discoveredToolToApiDef } from "../mcp-client";
import { mcpConnectionManager } from "../mcp/connection-manager";
import { useIdentityStore } from "../../stores/identity-store";
import { logger } from "../logger";

const log = logger.withContext("ToolExecutor");

export type RemoteToolsCache = Map<string, { server: McpServer; tool: DiscoveredTool }>;

export async function buildTools(
  model: { capabilities: { toolCall: boolean } },
  identity: Identity | undefined,
): Promise<{ toolDefs: ChatApiToolDef[]; remoteToolsCache: RemoteToolsCache }> {
  const emptyResult = { toolDefs: [], remoteToolsCache: new Map() as RemoteToolsCache };
  // Skip tools entirely if model doesn't support tool calls
  if (!model.capabilities.toolCall) return emptyResult;

  const identityStore = useIdentityStore.getState();
  const seen = new Set<string>();
  const result: ChatApiToolDef[] = [];

  // 1. Built-in tools
  // With identity: use explicitly bound tools
  // Without identity: fallback to global scope tools
  let builtInTools: typeof identityStore.mcpTools;
  if (identity) {
    const boundToolIds = new Set(identity.mcpToolIds);
    builtInTools = boundToolIds.size > 0
      ? identityStore.mcpTools.filter((t) => t.enabled && boundToolIds.has(t.id))
      : [];
  } else {
    builtInTools = identityStore.mcpTools.filter((t) => t.enabled && t.scope === "global");
  }

  for (const t of builtInTools) {
    const def = toolToApiDef(t);
    if (def && !seen.has(def.function.name)) {
      seen.add(def.function.name);
      result.push(def);
    }
  }

  // 2. Remote MCP servers — use persistent connections, discover in parallel
  const remoteToolsCache: RemoteToolsCache = new Map();
  let enabledServers: McpServer[];
  if (identity && identity.mcpServerIds.length) {
    enabledServers = identityStore.mcpServers.filter((s) => s.enabled && identity.mcpServerIds.includes(s.id));
  } else {
    // Without identity (or no servers bound): use all globally enabled servers
    enabledServers = identityStore.mcpServers.filter((s) => s.enabled);
  }

  const DISCOVERY_TIMEOUT = 10000; // 10s per server
  if (enabledServers.length > 0) {
    const discoveries = await Promise.allSettled(
      enabledServers.map(async (server) => {
        const tools = await Promise.race([
          mcpConnectionManager.discoverTools(server),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${DISCOVERY_TIMEOUT}ms`)), DISCOVERY_TIMEOUT),
          ),
        ]);
        return { server, tools };
      }),
    );
    for (const result_ of discoveries) {
      if (result_.status === "fulfilled") {
        const { server, tools: serverTools } = result_.value;
        const disabled = new Set(server.disabledTools ?? []);
        for (const tool of serverTools) {
          if (disabled.has(tool.name)) continue;
          if (!seen.has(tool.name)) {
            seen.add(tool.name);
            result.push(discoveredToolToApiDef(tool));
            remoteToolsCache.set(tool.name, { server, tool });
          }
        }
      } else {
        log.warn(`Failed to discover tools: ${result_.reason}`);
      }
    }
  }

  return { toolDefs: result, remoteToolsCache };
}

export async function executeToolCalls(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
  remoteToolsCache: RemoteToolsCache = new Map(),
): Promise<Array<{ toolCallId: string; content: string }>> {
  const identityStore = useIdentityStore.getState();
  const results: Array<{ toolCallId: string; content: string }> = [];

  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments);
    } catch { /* empty args */ }

    // Check remote tools cache first (from buildTools discovery)
    const remote = remoteToolsCache.get(tc.name);
    if (remote) {
      const EXEC_TIMEOUT = 30000; // 30s for tool execution
      try {
        const result = await Promise.race([
          mcpConnectionManager.callTool(remote.server, tc.name, args),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool execution timeout after ${EXEC_TIMEOUT}ms`)), EXEC_TIMEOUT),
          ),
        ]);
        results.push({
          toolCallId: tc.id,
          content: result.success ? result.content : `Error: ${result.error}`,
        });
      } catch (err) {
        results.push({
          toolCallId: tc.id,
          content: `Error: ${err instanceof Error ? err.message : "Tool execution failed"}`,
        });
      }
      continue;
    }

    // Fallback: built-in tools
    const tcLower = tc.name.toLowerCase();
    const tool = identityStore.mcpTools.find((t) => {
      const schemaName = t.schema?.name?.toLowerCase() ?? "";
      const toolName = t.name.toLowerCase();
      return schemaName === tcLower || toolName === tcLower
        || toolName.replace(/\s+/g, "_") === tcLower;
    });

    if (!tool) {
      log.warn(`Tool not found: "${tc.name}". Built-in:`, identityStore.mcpTools.map((t) => t.schema?.name));
      results.push({ toolCallId: tc.id, content: `Tool not found: ${tc.name}` });
      continue;
    }

    const result = await executeTool(tool, args);
    results.push({
      toolCallId: tc.id,
      content: result.success ? result.content : `Error: ${result.error}`,
    });
  }

  return results;
}
