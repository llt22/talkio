import { fetch as expoFetch } from "expo/fetch";
import type {
  ChatApiRequest,
  ChatApiResponse,
  StreamDelta,
  Provider,
} from "../types";

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private apiVersion?: string;
  private customHeaders: Record<string, string>;

  constructor(provider: Provider) {
    this.baseUrl = provider.baseUrl.replace(/\/+$/, "");
    this.apiKey = provider.apiKey;
    this.apiVersion = provider.apiVersion;
    this.customHeaders = {};
    for (const h of provider.customHeaders ?? []) {
      if (h.name && h.value) this.customHeaders[h.name] = h.value;
    }
  }

  async listModels(): Promise<Array<{ id: string; object: string }>> {
    const response = await fetch(this.getUrl("/models"), {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.data ?? [];
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  async chat(request: ChatApiRequest): Promise<ChatApiResponse> {
    const response = await fetch(this.getUrl("/chat/completions"), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ ...request, stream: false }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  async *streamChat(
    request: ChatApiRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamDelta, void, unknown> {
    // expo/fetch provides ReadableStream on both native (Hermes) and web
    const response = await expoFetch(this.getUrl("/chat/completions"), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stream API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("Stream response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processLine = function* (line: string): Generator<StreamDelta> {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) return;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta as StreamDelta | undefined;
        if (delta) {
          // Normalize reasoning content from various proxy formats
          if (!delta.reasoning_content) {
            // Check choice level
            const rc = choice?.reasoning_content ?? (choice as any)?.reasoning
              ?? (choice as any)?.thinking ?? (choice as any)?.thinking_content;
            if (rc) delta.reasoning_content = rc;
          }
          // Check delta level alternate field names
          if (!delta.reasoning_content) {
            const dr = (delta as any).reasoning ?? (delta as any).thinking
              ?? (delta as any).thinking_content;
            if (dr) delta.reasoning_content = dr;
          }
          yield delta;
        }
      } catch {
        // skip malformed JSON lines
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          yield* processLine(line);
        }
      }
      // Process remaining buffer after stream ends
      if (buffer.trim()) {
        yield* processLine(buffer);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async probeVision(modelId: string): Promise<boolean> {
    try {
      const response = await this.chat({
        model: modelId,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
                },
              },
              { type: "text", text: "What color is this pixel?" },
            ],
          },
        ],
        stream: false,
        max_tokens: 20,
      });
      return !!response.choices?.[0]?.message?.content;
    } catch {
      return false;
    }
  }

  async probeToolCall(modelId: string): Promise<boolean> {
    try {
      const response = await this.chat({
        model: modelId,
        messages: [{ role: "user", content: "What is the weather?" }],
        stream: false,
        max_tokens: 20,
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: { location: { type: "string" } },
                required: ["location"],
              },
            },
          },
        ],
      });
      return !!response.choices?.[0]?.message?.tool_calls?.length;
    } catch {
      return false;
    }
  }

  async probeReasoning(modelId: string): Promise<boolean> {
    try {
      const response = await fetch(this.getUrl("/chat/completions"), {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "What is 2+2?" }],
          stream: false,
          max_tokens: 50,
        }),
      });
      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      return !!msg?.reasoning_content;
    } catch {
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.customHeaders,
    };
  }

  private getUrl(path: string): string {
    let url = `${this.baseUrl}${path}`;
    if (this.apiVersion) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}api-version=${this.apiVersion}`;
    }
    return url;
  }
}
