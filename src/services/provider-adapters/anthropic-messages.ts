import type {
  ProviderAdapter,
  StreamChatParams,
  StreamChatResult,
  ChatParams,
  ProbeParams,
  ProbeResult,
} from "./types";
import { consumeAnthropicMessagesSse } from "../anthropic-messages-sse";
import { appFetch } from "../../lib/http";

// ── Helpers ──

/** Convert OpenAI-style messages to Anthropic format, extracting system separately */
function toAnthropicMessages(
  messages: Array<{ role: string; content: unknown }>,
): { system: string | undefined; messages: Array<{ role: string; content: unknown }> } {
  let system: string | undefined;
  const out: Array<{ role: string; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : "";
      continue;
    }

    let content: unknown;
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = (msg.content as any[]).map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url") {
          const url = part.image_url?.url ?? "";
          const m = url.match(/^data:([^;]+);base64,(.+)$/);
          if (m)
            return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
          return { type: "image", source: { type: "url", url } };
        }
        return part;
      });
    } else {
      content = msg.content;
    }

    // Merge consecutive same-role messages (Anthropic requirement)
    if (out.length > 0 && out[out.length - 1].role === msg.role) {
      const prev = out[out.length - 1];
      const toArr = (c: unknown) =>
        typeof c === "string" ? [{ type: "text", text: c }] : (c as unknown[]);
      prev.content = [...toArr(prev.content), ...toArr(content)];
    } else {
      out.push({ role: msg.role, content });
    }
  }

  return { system, messages: out };
}

/** Convert OpenAI-style tool defs to Anthropic format */
function toAnthropicTools(toolDefs: any[]): any[] {
  return toolDefs.map((t) => ({
    name: t.function?.name ?? t.name,
    description: t.function?.description ?? t.description,
    input_schema: t.function?.parameters ?? t.input_schema ?? { type: "object", properties: {} },
  }));
}

// ── Adapter ──

export class AnthropicMessagesAdapter implements ProviderAdapter {
  async streamChat(params: StreamChatParams): Promise<StreamChatResult> {
    const { system, messages } = toAnthropicMessages(params.messages);

    const body: Record<string, unknown> = {
      model: params.modelId,
      messages,
      max_tokens: 8192,
      stream: true,
    };
    if (system) body.system = system;
    if (params.identity?.params?.temperature !== undefined) {
      body.temperature = params.identity.params.temperature;
    }
    if (params.reasoningEffort) {
      // Anthropic uses "thinking" for reasoning/extended thinking
      body.thinking = { type: "enabled", budget_tokens: 4096 };
    }
    const toolDefs = params.toolDefs ?? [];
    if (toolDefs.length > 0) {
      body.tools = toAnthropicTools(toolDefs);
    }

    const response = await appFetch(`${params.baseUrl}/v1/messages`, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const usage = await consumeAnthropicMessagesSse(reader, params.onDelta);
    return { usage };
  }

  async chat(params: ChatParams): Promise<string> {
    const { system, messages } = toAnthropicMessages(
      params.messages.map((m) => ({ role: m.role, content: m.content })),
    );

    const body: Record<string, unknown> = {
      model: params.modelId,
      messages,
      max_tokens: params.maxTokens ?? 1000,
      stream: false,
    };
    if (system) body.system = system;
    if (params.temperature !== undefined) body.temperature = params.temperature;

    const response = await appFetch(`${params.baseUrl}/v1/messages`, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const content = data.content
      ?.find((b: any) => b.type === "text")
      ?.text?.trim();
    if (!content) throw new Error("Empty response");
    return content;
  }

  async probeCapabilities(params: ProbeParams): Promise<ProbeResult> {
    const caps: ProbeResult = { vision: false, toolCall: false, reasoning: false, streaming: true };

    // Probe vision
    try {
      const res = await appFetch(`${params.baseUrl}/v1/messages`, {
        method: "POST",
        headers: params.headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: params.modelId,
          max_tokens: 1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "hi" },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  },
                },
              ],
            },
          ],
        }),
      });
      caps.vision = res.ok;
    } catch {
      /* ignore */
    }

    // Probe tool call
    try {
      const res = await appFetch(`${params.baseUrl}/v1/messages`, {
        method: "POST",
        headers: params.headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: params.modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
          tools: [
            {
              name: "test",
              description: "test",
              input_schema: { type: "object", properties: {} },
            },
          ],
        }),
      });
      caps.toolCall = res.ok;
    } catch {
      /* ignore */
    }

    return caps;
  }
}
