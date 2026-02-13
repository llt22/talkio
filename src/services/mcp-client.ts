import type { McpTool, McpToolSchema, CustomHeader } from "../types";

function buildHeaders(base: Record<string, string>, extra?: CustomHeader[]): Record<string, string> {
  const headers = { ...base };
  if (extra) {
    for (const h of extra) {
      if (h.name && h.value) headers[h.name] = h.value;
    }
  }
  return headers;
}

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
async function connectMcpSse(sseUrl: string, extraHeaders?: CustomHeader[], timeoutMs = 10000): Promise<McpSession> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("MCP SSE connection timeout"));
    }, timeoutMs);

    fetch(sseUrl, {
      headers: buildHeaders({ Accept: "text/event-stream" }, extraHeaders),
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
  extraHeaders?: CustomHeader[],
): Promise<Record<string, unknown>> {
  const response = await fetch(messageEndpoint, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }, extraHeaders),
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
 * Initialize an MCP session on a given message endpoint.
 */
async function initMcpSession(messageEndpoint: string, extraHeaders?: CustomHeader[]): Promise<void> {
  await mcpRpcCall(messageEndpoint, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "avatar-app", version: "1.0.0" },
  }, 1, extraHeaders);

  // Send initialized notification (fire and forget)
  fetch(messageEndpoint, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }, extraHeaders),
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});
}

/**
 * Extract tool call result content from JSON-RPC response.
 */
function extractToolResult(result: Record<string, unknown>): McpExecutionResult {
  console.log("[MCP] Raw response:", JSON.stringify(result).slice(0, 500));

  const rpcResult = (result as any).result;

  // JSON-RPC error object { error: { code, message, data } }
  if ((result as any).error) {
    const err = (result as any).error;
    const msg = typeof err === "string" ? err
      : err.message ?? err.data ?? JSON.stringify(err);
    return { success: false, content: "", error: msg };
  }

  // MCP tool result { result: { content: [...], isError } }
  if (rpcResult?.content) {
    const contentItems = Array.isArray(rpcResult.content) ? rpcResult.content : [rpcResult.content];
    const textParts = contentItems
      .map((c: any) => (typeof c === "string" ? c : c.text ?? JSON.stringify(c)))
      .join("\n");
    if (rpcResult.isError) {
      return { success: false, content: "", error: textParts || "Tool execution failed" };
    }
    return { success: true, content: textParts };
  }

  // Result exists but no content field
  if (rpcResult !== undefined) {
    return { success: true, content: typeof rpcResult === "string" ? rpcResult : JSON.stringify(rpcResult) };
  }

  return { success: false, content: "", error: `Unexpected MCP response: ${JSON.stringify(result).slice(0, 200)}` };
}

interface StreamableHttpResult {
  data: Record<string, unknown> | null;
  sessionId?: string;
}

/**
 * Try Streamable HTTP protocol (new): POST directly to endpoint.
 * Returns null data if server doesn't support it (e.g. 405).
 * Captures Mcp-Session-Id from response for subsequent requests.
 */
async function tryStreamableHttp(
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
  extraHeaders?: CustomHeader[],
  sessionId?: string,
): Promise<StreamableHttpResult> {
  try {
    const base: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId) base["Mcp-Session-Id"] = sessionId;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(base, extraHeaders),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    const respSessionId = response.headers.get("mcp-session-id") ?? sessionId;

    // 405 = server doesn't accept POST on this URL (likely old SSE endpoint)
    if (response.status === 405 || response.status === 406) return { data: null };

    if (!response.ok) {
      throw new Error(`MCP error ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data:")) {
          try { return { data: JSON.parse(line.slice(5).trim()), sessionId: respSessionId }; } catch {}
        }
      }
      throw new Error("No JSON-RPC response in SSE stream");
    }

    return { data: await response.json(), sessionId: respSessionId };
  } catch (err) {
    if (err instanceof Error && err.message.includes("405")) return { data: null };
    throw err;
  }
}

/**
 * Execute a remote MCP tool.
 * Tries Streamable HTTP first, falls back to old SSE protocol.
 */
async function executeRemoteTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpExecutionResult> {
  if (!tool.endpoint) {
    return { success: false, content: "", error: "No endpoint configured" };
  }

  const hdrs = tool.customHeaders;

  try {
    // Try Streamable HTTP first (new protocol: single endpoint)
    const initResp = await tryStreamableHttp(tool.endpoint, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "avatar-app", version: "1.0.0" },
    }, 1, hdrs);

    if (initResp.data !== null) {
      const sid = initResp.sessionId;
      // Streamable HTTP works — send initialized + tools/call
      await tryStreamableHttp(tool.endpoint, "notifications/initialized", {}, 0, hdrs, sid);
      const callResp = await tryStreamableHttp(tool.endpoint, "tools/call", {
        name: tool.schema?.name ?? tool.name,
        arguments: args,
      }, 2, hdrs, sid);
      if (!callResp.data) throw new Error("tools/call failed");
      return extractToolResult(callResp.data);
    }

    // Fallback: Old SSE protocol (GET /sse → endpoint event → POST)
    const session = await connectMcpSse(tool.endpoint, hdrs);
    await initMcpSession(session.messageEndpoint, hdrs);

    const result = await mcpRpcCall(session.messageEndpoint, "tools/call", {
      name: tool.schema?.name ?? tool.name,
      arguments: args,
    }, 2, hdrs);

    return extractToolResult(result);
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
 * Tries Streamable HTTP first, falls back to old SSE protocol.
 */
export async function listRemoteTools(
  endpoint: string,
  extraHeaders?: CustomHeader[],
): Promise<{ name: string; description: string; inputSchema: Record<string, unknown> }[]> {
  // Try Streamable HTTP first
  const initResp = await tryStreamableHttp(endpoint, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "avatar-app", version: "1.0.0" },
  }, 1, extraHeaders);

  if (initResp.data !== null) {
    const sid = initResp.sessionId;
    await tryStreamableHttp(endpoint, "notifications/initialized", {}, 0, extraHeaders, sid);
    const listResp = await tryStreamableHttp(endpoint, "tools/list", {}, 2, extraHeaders, sid);
    return (listResp.data as any)?.result?.tools ?? [];
  }

  // Fallback: Old SSE protocol
  const session = await connectMcpSse(endpoint, extraHeaders);
  await initMcpSession(session.messageEndpoint, extraHeaders);

  const result = await mcpRpcCall(session.messageEndpoint, "tools/list", {}, 2, extraHeaders);
  return (result as any).result?.tools ?? [];
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
