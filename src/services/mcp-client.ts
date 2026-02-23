import type { McpTool, McpToolSchema, DiscoveredTool } from "../types";
import { mcpConnectionManager } from "./mcp/connection-manager";

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

// ── Remote Tool Execution (delegated to connection-manager) ──

/**
 * Execute a remote MCP tool via the persistent connection manager.
 * Legacy McpTool-based remote execution — creates a temporary McpServer
 * from the tool's endpoint and delegates to connection-manager.
 */
async function executeRemoteTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  if (!tool.endpoint) {
    return { success: false, content: "", error: "No endpoint configured" };
  }

  // Build a temporary McpServer from the legacy McpTool fields
  const tempServer = {
    id: `legacy-${tool.id}`,
    name: tool.name,
    url: tool.endpoint,
    customHeaders: tool.customHeaders,
    enabled: true,
  };

  return mcpConnectionManager.callTool(
    tempServer,
    tool.schema?.name ?? tool.name,
    args,
  );
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
