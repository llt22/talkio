import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { RNStreamableHTTPClientTransport } from "./rn-streamable-http-transport";
import type { McpServer, CustomHeader, DiscoveredTool } from "../../types";
import { logger } from "../logger";

const log = logger.withContext("McpConnPool");

interface ManagedConnection {
  client: Client;
  server: McpServer;
  tools: DiscoveredTool[];
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
        { name: "avatar-app", version: "1.0.0" },
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
   * Discover tools from a server, using cache if available.
   */
  async discoverTools(server: McpServer): Promise<DiscoveredTool[]> {
    const conn = await this.ensureConnected(server);
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
  ): Promise<{ success: boolean; content: string; error?: string }> {
    let conn: ManagedConnection;
    try {
      conn = await this.ensureConnected(server);
    } catch (err) {
      return {
        success: false,
        content: "",
        error: `Connection failed: ${err instanceof Error ? err.message : "Unknown"}`,
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
        return { success: false, content: "", error: textParts || "Tool execution failed" };
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
}

export const mcpConnectionManager = new McpConnectionManager();
