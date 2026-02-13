import type { McpTool, McpToolSchema } from "../types";

export interface McpExecutionResult {
  success: boolean;
  content: string;
  error?: string;
}

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

// ── MCP SSE Protocol Client ──

interface McpSession {
  messageEndpoint: string;
  sessionId?: string;
}

/**
 * Connect to MCP SSE endpoint and discover the message endpoint URL.
 * MCP SSE protocol: GET /sse → server sends "endpoint" event with POST URL.
 */
async function connectMcpSse(sseUrl: string, timeoutMs = 10000): Promise<McpSession> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("MCP SSE connection timeout"));
    }, timeoutMs);

    fetch(sseUrl, {
      headers: { Accept: "text/event-stream" },
    })
      .then(async (response) => {
        if (!response.ok) {
          clearTimeout(timer);
          reject(new Error(`MCP SSE connection failed: ${response.status}`));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          clearTimeout(timer);
          reject(new Error("No response body"));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let eventType = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:") && eventType === "endpoint") {
                const endpointPath = line.slice(5).trim();
                clearTimeout(timer);
                reader.cancel();

                // Resolve relative URL against SSE base
                const base = new URL(sseUrl);
                const messageEndpoint = endpointPath.startsWith("http")
                  ? endpointPath
                  : `${base.origin}${endpointPath}`;

                resolve({ messageEndpoint });
                return;
              }
            }
          }
        } catch {
          // Reader cancelled, expected
        }

        clearTimeout(timer);
        reject(new Error("SSE stream ended without endpoint event"));
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Send a JSON-RPC message to the MCP message endpoint.
 */
async function mcpRpcCall(
  messageEndpoint: string,
  method: string,
  params: Record<string, unknown>,
  id: number = 1,
): Promise<Record<string, unknown>> {
  const response = await fetch(messageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MCP RPC error ${response.status}: ${errText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  // Server may respond with JSON directly
  if (contentType.includes("application/json")) {
    return response.json();
  }

  // Or with SSE stream containing the response
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data) {
          try {
            return JSON.parse(data);
          } catch { /* skip non-JSON data lines */ }
        }
      }
    }
    throw new Error("No JSON-RPC response in SSE stream");
  }

  // Fallback: try parsing as JSON anyway
  return response.json();
}

/**
 * Execute a remote MCP tool using the SSE protocol.
 */
async function executeRemoteTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  if (!tool.endpoint) {
    return { success: false, content: "", error: "No endpoint configured" };
  }

  try {
    // Step 1: Connect to SSE endpoint and get message URL
    const session = await connectMcpSse(tool.endpoint);

    // Step 2: Initialize the MCP session
    await mcpRpcCall(session.messageEndpoint, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "avatar-app", version: "1.0.0" },
    }, 1);

    // Step 3: Send initialized notification (no response expected)
    fetch(session.messageEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }).catch(() => { /* fire and forget */ });

    // Step 4: Call the tool
    const result = await mcpRpcCall(session.messageEndpoint, "tools/call", {
      name: tool.schema?.name ?? tool.name,
      arguments: args,
    }, 2);

    // Extract result content
    const rpcResult = (result as any).result;
    if (rpcResult?.content) {
      const contentItems = Array.isArray(rpcResult.content) ? rpcResult.content : [rpcResult.content];
      const textParts = contentItems
        .map((c: any) => (typeof c === "string" ? c : c.text ?? JSON.stringify(c)))
        .join("\n");
      return { success: !rpcResult.isError, content: textParts };
    }

    if ((result as any).error) {
      return {
        success: false,
        content: "",
        error: (result as any).error.message ?? JSON.stringify((result as any).error),
      };
    }

    return { success: true, content: JSON.stringify(result) };
  } catch (err) {
    return {
      success: false,
      content: "",
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Connect to a remote MCP server and list available tools.
 * Used during import to discover tool schemas.
 */
export async function listRemoteTools(
  sseUrl: string,
): Promise<{ name: string; description: string; inputSchema: Record<string, unknown> }[]> {
  const session = await connectMcpSse(sseUrl);

  await mcpRpcCall(session.messageEndpoint, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "avatar-app", version: "1.0.0" },
  }, 1);

  fetch(session.messageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});

  const result = await mcpRpcCall(session.messageEndpoint, "tools/list", {}, 2);
  const tools = (result as any).result?.tools ?? [];
  return tools;
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
