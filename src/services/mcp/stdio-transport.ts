/**
 * MCP Stdio Transport — communicates with MCP servers via Tauri's
 * child process management (stdin/stdout JSON-RPC).
 *
 * Desktop only. On mobile/web, this transport is unavailable.
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

let invokePromise: Promise<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null> | null = null;

function getTauriInvoke(): Promise<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null> {
  if (invokePromise) return invokePromise;
  const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  if (isTauri) {
    invokePromise = import("@tauri-apps/api/core")
      .then((mod) => mod.invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>)
      .catch(() => null);
  } else {
    invokePromise = Promise.resolve(null);
  }
  return invokePromise!;
}

export function isStdioAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const hasTauri = "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
  if (!hasTauri) return false;
  // Stdio subprocess only works on desktop Tauri, not mobile (Android/iOS)
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);
  return !isMobile;
}

export class TauriStdioTransport implements Transport {
  public sessionId: string | undefined;
  private invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined;
  private _started = false;

  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    private command: string,
    private args: string[],
    private env?: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    if (this._started) throw new Error("Transport already started");

    this.invoke = (await getTauriInvoke()) ?? undefined;
    if (!this.invoke) {
      throw new Error("Tauri invoke not available — stdio transport requires desktop environment");
    }

    try {
      this.sessionId = await this.invoke("mcp_stdio_start", {
        command: this.command,
        args: this.args,
        env: this.env ?? {},
      }) as string;
      this._started = true;
      console.log("[MCP Stdio] Session started:", this.sessionId);
    } catch (err) {
      const error = new Error(`Failed to start MCP stdio: ${err}`);
      this.onerror?.(error);
      throw error;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.invoke || !this.sessionId) {
      throw new Error("Transport not started");
    }

    try {
      const responseStr = await this.invoke("mcp_stdio_send", {
        sessionId: this.sessionId,
        message: JSON.stringify(message),
      }) as string;

      if (responseStr && responseStr.trim()) {
        try {
          const data = JSON.parse(responseStr);
          // Could be a single message or an array
          const msgs = Array.isArray(data)
            ? data.map((item) => JSONRPCMessageSchema.parse(item))
            : [JSONRPCMessageSchema.parse(data)];
          msgs.forEach((m) => this.onmessage?.(m));
        } catch (parseErr) {
          this.onerror?.(new Error(`Failed to parse MCP response: ${parseErr}`));
        }
      }
    } catch (err) {
      const error = new Error(`MCP stdio send failed: ${err}`);
      this.onerror?.(error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.invoke && this.sessionId) {
      try {
        await this.invoke("mcp_stdio_stop", { sessionId: this.sessionId });
        console.log("[MCP Stdio] Session stopped:", this.sessionId);
      } catch (err) {
        console.warn("[MCP Stdio] Error stopping session:", err);
      }
    }
    this.sessionId = undefined;
    this._started = false;
    this.onclose?.();
  }
}
