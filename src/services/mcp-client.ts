import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { RNStreamableHTTPClientTransport } from "./mcp/rn-streamable-http-transport";
import type { McpTool, McpToolSchema, McpServer, DiscoveredTool, CustomHeader } from "../types";

export interface McpExecutionResult {
  success: boolean;
  content: string;
  error?: string;
}

// ── Local Tool Handlers ──

type LocalToolHandler = (args: Record<string, unknown>) => Promise<McpExecutionResult>;

const localHandlers = new Map<string, LocalToolHandler>();

export function registerLocalTool(
  toolId: string,
  handler: LocalToolHandler,
): void {
  localHandlers.set(toolId, handler);
}

export async function executeTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  if (tool.type === "local") {
    return executeLocalTool(tool, args);
  }
  return executeRemoteTool(tool, args);
}

async function executeLocalTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  const handler = localHandlers.get(tool.id);
  if (!handler) {
    return {
      success: false,
      content: "",
      error: `No handler registered for tool: ${tool.name}`,
    };
  }

  try {
    return await handler(args);
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── MCP SDK Client Helpers ──

function buildRequestInit(customHeaders?: CustomHeader[]): RequestInit | undefined {
  if (!customHeaders?.length) return undefined;
  const headers: Record<string, string> = {};
  for (const h of customHeaders) {
    if (h.name && h.value) headers[h.name] = h.value;
  }
  return { headers };
}

async function createMcpClient(
  endpoint: string,
  customHeaders?: CustomHeader[],
): Promise<Client> {
  const transport = new RNStreamableHTTPClientTransport(endpoint, {
    requestInit: buildRequestInit(customHeaders),
  });
  const client = new Client(
    { name: "avatar-app", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

/**
 * Execute a remote MCP tool using the official SDK Client.
 */
async function executeRemoteTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  if (!tool.endpoint) {
    return { success: false, content: "", error: "No endpoint configured" };
  }

  let client: Client | null = null;
  try {
    client = await createMcpClient(tool.endpoint, tool.customHeaders);

    const result = await client.callTool({
      name: tool.schema?.name ?? tool.name,
      arguments: args,
    });

    // Parse SDK response
    const contentArray = Array.isArray(result.content) ? result.content : [];
    const textParts = contentArray
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item.type === "text") return item.text ?? "";
        return JSON.stringify(item);
      })
      .join("\n");

    if (result.isError) {
      return { success: false, content: "", error: textParts || "Tool execution failed" };
    }

    return { success: true, content: textParts || JSON.stringify(result) };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Network error",
    };
  } finally {
    try { await client?.close(); } catch { /* ignore */ }
  }
}

/**
 * Connect to a remote MCP server and list available tools.
 * Uses the official MCP SDK Client with RN-compatible transport.
 */
export async function listRemoteTools(
  endpoint: string,
  extraHeaders?: CustomHeader[],
): Promise<{ name: string; description: string; inputSchema: Record<string, unknown> }[]> {
  let client: Client | null = null;
  try {
    client = await createMcpClient(endpoint, extraHeaders);
    const { tools } = await client.listTools();
    return (tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    }));
  } finally {
    try { await client?.close(); } catch { /* ignore */ }
  }
}

export function toolToApiDef(tool: McpTool): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
} | null {
  const schema: McpToolSchema | null = tool.schema;
  if (!schema) return null;

  return {
    type: "function",
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    },
  };
}

// ── McpServer-level API ──

/**
 * Discover tools from an MCP server.
 * Returns DiscoveredTool[] with serverId for routing.
 */
export async function discoverServerTools(server: McpServer): Promise<DiscoveredTool[]> {
  let client: Client | null = null;
  try {
    client = await createMcpClient(server.url, server.customHeaders);
    const { tools } = await client.listTools();
    return (tools ?? []).map((t) => ({
      serverId: server.id,
      serverName: server.name,
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    }));
  } finally {
    try { await client?.close(); } catch { /* ignore */ }
  }
}

/**
 * Execute a tool on a specific MCP server.
 */
export async function executeServerTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  let client: Client | null = null;
  try {
    client = await createMcpClient(server.url, server.customHeaders);

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    const contentArray = Array.isArray(result.content) ? result.content : [];
    const textParts = contentArray
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item.type === "text") return item.text ?? "";
        return JSON.stringify(item);
      })
      .join("\n");

    if (result.isError) {
      return { success: false, content: "", error: textParts || "Tool execution failed" };
    }

    return { success: true, content: textParts || JSON.stringify(result) };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Network error",
    };
  } finally {
    try { await client?.close(); } catch { /* ignore */ }
  }
}

/**
 * Convert a DiscoveredTool to OpenAI function-calling format.
 */
export function discoveredToolToApiDef(tool: DiscoveredTool): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}
