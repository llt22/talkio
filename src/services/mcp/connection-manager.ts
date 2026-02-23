import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { RNStreamableHTTPClientTransport } from "./rn-streamable-http-transport";
import type { McpServer, CustomHeader, DiscoveredTool } from "../../types";
import { logger } from "../logger";

const log = logger.withContext("McpConnPool");

export type McpConnectionStatus = "idle" | "connecting" | "connected" | "error";
export type McpErrorCode = "NETWORK" | "AUTH" | "TIMEOUT" | "SERVER_ERROR" | "UNKNOWN";

function classifyError(err: unknown): McpErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized") || msg.includes("Forbidden")) return "AUTH";
  if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("ETIMEDOUT")) return "TIMEOUT";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return "SERVER_ERROR";
  if (msg.includes("Network") || msg.includes("network") || msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) return "NETWORK";
  return "UNKNOWN";
}

interface ManagedConnection {
  client: Client;
  server: McpServer;
  tools: DiscoveredTool[];
  toolsDiscoveredAt: number;
  connected: boolean;
  connecting: Promise<void> | null;
}

function buildRequestInit(customHeaders?: CustomHeader[]): RequestInit | undefined {
  if (!customHeaders?.length) return undefined;
  const headers: Record<string, string> = {};
  for (const h of customHeaders) {
    if (h.name && h.value) headers[h.name] = h.value;
  }
  return { headers };
}

class McpConnectionManager {
  private connections = new Map<string, ManagedConnection>();

  /** Tools cache TTL in milliseconds (5 minutes) */
  private readonly TOOLS_TTL = 5 * 60 * 1000;

  /**
   * Get or create a persistent connection to an MCP server.
   * Returns cached tools if already connected.
   */
  async ensureConnected(server: McpServer): Promise<ManagedConnection> {
    const existing = this.connections.get(server.id);
    if (existing?.connected) return existing;
    if (existing?.connecting) {
      await existing.connecting;
      return this.connections.get(server.id)!;
    }

    const conn: ManagedConnection = {
      client: null!,
      server,
      tools: [],
      toolsDiscoveredAt: 0,
      connected: false,
      connecting: null,
    };
    this.connections.set(server.id, conn);

    conn.connecting = this.connect(conn);
    await conn.connecting;
    conn.connecting = null;
    return conn;
  }

  private async connect(conn: ManagedConnection): Promise<void> {
    try {
      log.info(`Connecting to ${conn.server.name} (${conn.server.url})...`);
      const transport = new RNStreamableHTTPClientTransport(conn.server.url, {
        requestInit: buildRequestInit(conn.server.customHeaders),
      });
      const client = new Client(
        { name: "talkio-app", version: "1.0.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      conn.client = client;
      conn.connected = true;

      // Discover tools on connect
      const { tools } = await client.listTools();
      conn.tools = (tools ?? []).map((t) => ({
        serverId: conn.server.id,
        serverName: conn.server.name,
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      }));
      conn.toolsDiscoveredAt = Date.now();
      log.info(`Connected to ${conn.server.name}: ${conn.tools.length} tools`);
    } catch (err) {
      log.error(`Failed to connect to ${conn.server.name}: ${err instanceof Error ? err.message : err}`);
      conn.connected = false;
      this.connections.delete(conn.server.id);
      throw err;
    }
  }

  /**
   * Get cached tools for a server. Returns [] if not connected.
   */
  getCachedTools(serverId: string): DiscoveredTool[] {
    return this.connections.get(serverId)?.tools ?? [];
  }

  /**
   * Discover tools from a server, using cache if available and not stale.
   * Refreshes tools list when cache exceeds TOOLS_TTL.
   */
  async discoverTools(server: McpServer): Promise<DiscoveredTool[]> {
    const conn = await this.ensureConnected(server);

    // Refresh tools if cache is stale
    if (Date.now() - conn.toolsDiscoveredAt > this.TOOLS_TTL) {
      try {
        const { tools } = await conn.client.listTools();
        conn.tools = (tools ?? []).map((t) => ({
          serverId: conn.server.id,
          serverName: conn.server.name,
          name: t.name,
          description: t.description ?? "",
          inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
        }));
        conn.toolsDiscoveredAt = Date.now();
        log.info(`Refreshed tools for ${server.name}: ${conn.tools.length} tools`);
      } catch (err) {
        log.warn(`Failed to refresh tools for ${server.name}, using stale cache: ${err instanceof Error ? err.message : err}`);
      }
    }

    return conn.tools;
  }

  /**
   * Execute a tool on a connected server.
   * Reuses the persistent connection instead of creating a new one.
   */
  async callTool(
    server: McpServer,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; content: string; error?: string; errorCode?: McpErrorCode }> {
    let conn: ManagedConnection;
    try {
      conn = await this.ensureConnected(server);
    } catch (err) {
      return {
        success: false,
        content: "",
        error: `Connection failed: ${err instanceof Error ? err.message : "Unknown"}`,
        errorCode: classifyError(err),
      };
    }

    try {
      const result = await conn.client.callTool({ name: toolName, arguments: args });
      const contentArray = Array.isArray(result.content) ? result.content : [];
      const textParts = contentArray
        .map((item: any) => {
          if (typeof item === "string") return item;
          if (item.type === "text") return item.text ?? "";
          return JSON.stringify(item);
        })
        .join("\n");

      if (result.isError) {
        return { success: false, content: "", error: textParts || "Tool execution failed", errorCode: "SERVER_ERROR" };
      }
      return { success: true, content: textParts || JSON.stringify(result) };
    } catch (err) {
      // Connection might be stale, remove and let next call reconnect
      log.warn(`Tool call failed on ${server.name}, removing connection: ${err instanceof Error ? err.message : err}`);
      this.disconnect(server.id);
      return {
        success: false,
        content: "",
        error: err instanceof Error ? err.message : "Network error",
        errorCode: classifyError(err),
      };
    }
  }

  /**
   * Disconnect a specific server (e.g. when config changes).
   */
  disconnect(serverId: string): void {
    const conn = this.connections.get(serverId);
    if (conn) {
      try { conn.client?.close(); } catch { /* ignore */ }
      this.connections.delete(serverId);
      log.info(`Disconnected: ${conn.server.name}`);
    }
  }

  /**
   * Disconnect all servers (e.g. on app shutdown).
   */
  disconnectAll(): void {
    for (const [id] of this.connections) {
      this.disconnect(id);
    }
  }

  /**
   * Reset a server connection (e.g. when server config is updated).
   */
  reset(serverId: string): void {
    this.disconnect(serverId);
  }

  /**
   * Check if a server is currently connected.
   */
  isConnected(serverId: string): boolean {
    return this.connections.get(serverId)?.connected ?? false;
  }

  /**
   * Get connection status for a specific server.
   */
  getConnectionStatus(serverId: string): McpConnectionStatus {
    const conn = this.connections.get(serverId);
    if (!conn) return "idle";
    if (conn.connecting) return "connecting";
    if (conn.connected) return "connected";
    return "idle";
  }

  /**
   * Get connection statuses for all known servers.
   * Returns a map of serverId → status.
   */
  getAllConnectionStatuses(): Map<string, McpConnectionStatus> {
    const statuses = new Map<string, McpConnectionStatus>();
    for (const [id, conn] of this.connections) {
      if (conn.connecting) statuses.set(id, "connecting");
      else if (conn.connected) statuses.set(id, "connected");
      else statuses.set(id, "idle");
    }
    return statuses;
  }
}

export const mcpConnectionManager = new McpConnectionManager();
