/**
 * React Native compatible StreamableHTTP transport for MCP SDK.
 * Based on @cherrystudio/react-native-streamable-http (MIT License).
 * Adapted for Avatar app - uses fetch (Hermes compatible).
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { isInitializedNotification, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

// React Native compatible EventSource parser
class RNEventSourceParser {
  private buffer = "";

  parse(chunk: string): { event?: string; data: string; id?: string }[] {
    this.buffer += chunk;
    const events: { event?: string; data: string; id?: string }[] = [];
    const lines = this.buffer.split("\n");

    // Keep the last incomplete line in buffer
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

export interface RNStreamableHTTPOptions {
  requestInit?: RequestInit;
  sessionId?: string;
}

export class RNStreamableHTTPClientTransport implements Transport {
  private _url: string;
  private _requestInit?: RequestInit;
  private _sessionId?: string;
  private _abortController?: AbortController;
  private _protocolVersion?: string;

  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: string, options?: RNStreamableHTTPOptions) {
    this._url = url;
    this._requestInit = options?.requestInit;
    this._sessionId = options?.sessionId;
  }

  private _handleError(error: Error, context?: string): void {
    if (this.onerror) {
      this.onerror(error);
    } else {
      console.error(`[RNStreamableHTTP${context ? `:${context}` : ""}]`, error);
    }
  }

  private _commonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this._sessionId) {
      headers["mcp-session-id"] = this._sessionId;
    }

    if (this._protocolVersion) {
      headers["mcp-protocol-version"] = this._protocolVersion;
    }

    // Add extra headers from requestInit
    if (this._requestInit?.headers) {
      const extra = this._requestInit.headers;
      if (extra instanceof Headers) {
        extra.forEach((value, key) => { headers[key] = value; });
      } else if (Array.isArray(extra)) {
        extra.forEach(([key, value]) => { headers[key] = value; });
      } else {
        Object.assign(headers, extra);
      }
    }

    return headers;
  }

  private async _handleSseResponse(response: Response): Promise<void> {
    if (!response.body) return;

    const parser = new RNEventSourceParser();
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
              this._handleError(error as Error, "SSE parse");
            }
          }
        }
      }
    } catch (error) {
      this._handleError(error as Error, "SSE read");
    } finally {
      reader.releaseLock();
    }
  }

  async start(): Promise<void> {
    if (this._abortController) {
      throw new Error("Transport already started");
    }
    this._abortController = new AbortController();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      const headers = this._commonHeaders();
      headers["content-type"] = "application/json";
      headers["accept"] = "application/json, text/event-stream";

      const response = await fetch(this._url, {
        ...this._requestInit,
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: this._abortController?.signal,
      });

      // Capture session ID
      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) {
        this._sessionId = sessionId;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => null);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      // 202 Accepted = no body (notification acknowledged)
      if (response.status === 202) {
        if (isInitializedNotification(message)) {
          this._startSseStream().catch((err) => this._handleError(err, "SSE start"));
        }
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        await this._handleSseResponse(response);
        return;
      }

      // JSON response
      const text = await response.text();
      if (text.trim()) {
        if (contentType.includes("application/json")) {
          try {
            const data = JSON.parse(text);
            const msgs = Array.isArray(data)
              ? data.map((item) => JSONRPCMessageSchema.parse(item))
              : [JSONRPCMessageSchema.parse(data)];
            msgs.forEach((m) => this.onmessage?.(m));
          } catch (error) {
            this._handleError(error as Error, "JSON parse");
          }
        } else {
          // Try SSE data line fallback
          const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
          if (dataLine) {
            try {
              const parsed = JSONRPCMessageSchema.parse(JSON.parse(dataLine.slice(5).trim()));
              this.onmessage?.(parsed);
            } catch (error) {
              this._handleError(error as Error, "SSE data parse");
            }
          }
        }
      }
    } catch (error) {
      this._handleError(error as Error, "send");
      throw error;
    }
  }

  private async _startSseStream(): Promise<void> {
    try {
      const headers = this._commonHeaders();
      headers["Accept"] = "text/event-stream";

      const response = await fetch(this._url, {
        method: "GET",
        headers,
        signal: this._abortController?.signal,
      });

      if (!response.ok) {
        // 405 = server doesn't offer SSE stream at GET endpoint (expected)
        if (response.status === 405) return;
        throw new Error(`Failed to open SSE stream: ${response.statusText}`);
      }

      await this._handleSseResponse(response);
    } catch (error) {
      this._handleError(error as Error, "SSE stream");
    }
  }

  async close(): Promise<void> {
    this._abortController?.abort();
    this.onclose?.();
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  setProtocolVersion(version: string): void {
    this._protocolVersion = version;
  }
}
