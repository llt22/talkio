import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { isInitializedNotification, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

class EventSourceParser {
  private buffer = "";

  parse(chunk: string): { event?: string; data: string; id?: string }[] {
    this.buffer += chunk;
    const events: { event?: string; data: string; id?: string }[] = [];
    const lines = this.buffer.split("\n");
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
    if (!response.body) return;

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
    } catch (error) {
      this.handleError(error as Error);
    } finally {
      reader.releaseLock();
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

      const response = await fetch(this.url, {
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

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        await this.handleSseResponse(response);
        return;
      }

      const text = await response.text();
      if (!text.trim()) return;

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

      const response = await fetch(this.url, {
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
