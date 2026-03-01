import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  isInitializedNotification,
  JSONRPCMessageSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { isTauri } from "../../lib/platform";

// Use Tauri's native HTTP fetch (bypasses browser CORS) when available.
// Lazy-loaded promise ensures the import is resolved before first use.
let tauriFetchPromise: Promise<typeof globalThis.fetch | null> | null = null;

function getTauriFetch(): Promise<typeof globalThis.fetch | null> {
  if (tauriFetchPromise) return tauriFetchPromise;
  if (isTauri) {
    tauriFetchPromise = import("@tauri-apps/plugin-http")
      .then((mod) => {
        console.log("[MCP Transport] Tauri HTTP plugin loaded successfully");
        return mod.fetch as typeof globalThis.fetch;
      })
      .catch((err) => {
        console.warn("[MCP Transport] Failed to load Tauri HTTP plugin:", err);
        return null;
      });
  } else {
    tauriFetchPromise = Promise.resolve(null);
  }
  return tauriFetchPromise!;
}

async function mcpFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const fetchFn = await getTauriFetch();
  if (fetchFn) return fetchFn(input, init);
  return globalThis.fetch(input, init);
}

class EventSourceParser {
  private buffer = "";

  parse(chunk: string): { event?: string; data: string; id?: string }[] {
    this.buffer += chunk;
    const events: { event?: string; data: string; id?: string }[] = [];
    // Normalize \r\n and lone \r to \n before splitting (SSE spec allows all three)
    const lines = this.buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    this.buffer = lines.pop() || "";

    let currentEvent: { event?: string; data: string; id?: string } = { data: "" };

    for (const line of lines) {
      if (line === "") {
        if (currentEvent.data) {
          events.push(currentEvent);
          currentEvent = { data: "" };
        }
        continue;
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const field = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1).replace(/^ /, "");

      switch (field) {
        case "event":
          currentEvent.event = value;
          break;
        case "data":
          currentEvent.data += (currentEvent.data ? "\n" : "") + value;
          break;
        case "id":
          currentEvent.id = value;
          break;
      }
    }

    return events;
  }
}

export interface StreamableHTTPOptions {
  requestInit?: RequestInit;
  sessionId?: string;
}

export class StreamableHTTPClientTransport implements Transport {
  private url: string;
  private requestInit?: RequestInit;
  private _sessionId?: string;
  private abortController?: AbortController;
  private protocolVersion?: string;

  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: string, options?: StreamableHTTPOptions) {
    this.url = url;
    this.requestInit = options?.requestInit;
    this._sessionId = options?.sessionId;
  }

  private handleError(error: Error): void {
    if (this.onerror) this.onerror(error);
    else console.error("[MCP Transport]", error);
  }

  private commonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this._sessionId) headers["mcp-session-id"] = this._sessionId;
    if (this.protocolVersion) headers["mcp-protocol-version"] = this.protocolVersion;

    if (this.requestInit?.headers) {
      const extra = this.requestInit.headers;
      if (extra instanceof Headers) {
        extra.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(extra)) {
        extra.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, extra);
      }
    }

    return headers;
  }

  private async handleSseResponse(response: Response): Promise<void> {
    // Try streaming via ReadableStream first; if unavailable (e.g. Tauri on Android),
    // fall back to reading the full response text and parsing it.
    if (response.body && typeof response.body.getReader === "function") {
      try {
        const parser = new EventSourceParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const events = parser.parse(chunk);

            for (const event of events) {
              if (!event.event || event.event === "message") {
                try {
                  const message = JSONRPCMessageSchema.parse(JSON.parse(event.data));
                  this.onmessage?.(message);
                } catch (error) {
                  this.handleError(error as Error);
                }
              }
            }
          }
          return;
        } finally {
          reader.releaseLock();
        }
      } catch {
        // ReadableStream failed, fall through to text fallback
      }
    }

    // Fallback: read full response text and parse SSE events
    const text = await response.text();
    if (!text.trim()) return;
    const parser = new EventSourceParser();
    const events = parser.parse(text + "\n");
    for (const event of events) {
      if (!event.event || event.event === "message") {
        try {
          const message = JSONRPCMessageSchema.parse(JSON.parse(event.data));
          this.onmessage?.(message);
        } catch (error) {
          this.handleError(error as Error);
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.abortController) throw new Error("Transport already started");
    this.abortController = new AbortController();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      const headers = this.commonHeaders();
      headers["content-type"] = "application/json";
      headers["accept"] = "application/json, text/event-stream";

      const response = await mcpFetch(this.url, {
        ...this.requestInit,
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: this.abortController?.signal,
      });

      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) this._sessionId = sessionId;

      if (!response.ok) {
        const text = await response.text().catch(() => null);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      if (response.status === 202) {
        if (isInitializedNotification(message)) {
          this.startSseStream().catch((err) => this.handleError(err));
        }
        return;
      }

      // Read full response text (avoids ReadableStream hanging in Tauri)
      const text = await response.text();
      if (!text.trim()) return;

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        const parser = new EventSourceParser();
        const events = parser.parse(text + "\n");
        for (const event of events) {
          if (!event.event || event.event === "message") {
            try {
              const msg = JSONRPCMessageSchema.parse(JSON.parse(event.data));
              this.onmessage?.(msg);
            } catch (error) {
              this.handleError(error as Error);
            }
          }
        }
        return;
      }

      if (contentType.includes("application/json")) {
        const data = JSON.parse(text);
        const msgs = Array.isArray(data)
          ? data.map((item) => JSONRPCMessageSchema.parse(item))
          : [JSONRPCMessageSchema.parse(data)];
        msgs.forEach((m) => this.onmessage?.(m));
        return;
      }

      const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) return;
      const parsed = JSONRPCMessageSchema.parse(JSON.parse(dataLine.slice(5).trim()));
      this.onmessage?.(parsed);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async startSseStream(): Promise<void> {
    try {
      const headers = this.commonHeaders();
      headers["Accept"] = "text/event-stream";

      const response = await mcpFetch(this.url, {
        method: "GET",
        headers,
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        if (response.status === 405) return;
        throw new Error(`Failed to open SSE stream: ${response.statusText}`);
      }

      await this.handleSseResponse(response);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  async close(): Promise<void> {
    this.abortController?.abort();
    this.onclose?.();
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
  }
}
