/**
 * Native Gemini GenerateContent adapter — talks to Google's native protocol,
 * not through an OpenAI-compatible gateway, to keep native capabilities
 * (multimodal parts, thinkingConfig, native grounding).
 */
import type {
  ProviderAdapter,
  StreamChatParams,
  StreamChatResult,
  ChatParams,
  ProbeParams,
  ProbeResult,
} from "./types";
import { consumeGeminiGenerateContentSse } from "../gemini-sse";
import { appFetch } from "../../lib/http";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args: Record<string, unknown> };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Convert OpenAI-style messages (with tool calls/results) to Gemini contents. */
function toGeminiContents(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>,
): {
  system: string | undefined;
  contents: GeminiMessage[];
} {
  let system: string | undefined;
  const contents: GeminiMessage[] = [];
  const functionNamesByCallId = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : undefined;
      continue;
    }
    if (msg.role === "tool") {
      const callId = msg.tool_call_id ?? "";
      const functionName = functionNamesByCallId.get(callId);
      if (!functionName) {
        throw new Error(`Missing Gemini function name for tool call ${callId || "<empty>"}`);
      }
      const parts: GeminiPart[] = [
        {
          functionResponse: {
            id: callId || undefined,
            name: functionName,
            response: {
              content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
            },
          },
        },
      ];
      const last = contents[contents.length - 1];
      if (last && last.role === "user") last.parts.push(...parts);
      else contents.push({ role: "user", parts });
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] = [];
    if (typeof msg.content === "string") {
      if (msg.content) parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
      }>) {
        if (part.type === "text" && part.text) parts.push({ text: part.text });
        else if (part.type === "image_url") {
          const url = part.image_url?.url ?? "";
          const m = /^data:([^;]+);base64,(.+)$/.exec(url);
          if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
        }
      }
    }
    // Re-emit tool calls as functionCall parts so Gemini sees the full turn.
    const toolCalls = msg.tool_calls as
      | Array<{ id?: string; function?: { name?: string; arguments?: string } }>
      | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        const callId = tc.id ?? "";
        const functionName = tc.function?.name ?? "";
        if (callId && functionName) functionNamesByCallId.set(callId, functionName);
        let args: Record<string, unknown> = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = { raw: tc.function?.arguments ?? "" };
        }
        parts.push({
          functionCall: { id: callId || undefined, name: functionName, args },
        });
      }
    }

    if (parts.length === 0) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }

  return { system, contents };
}

function toGeminiTools(toolDefs: any[]): Array<{ functionDeclarations: unknown[] }> {
  if (toolDefs.length === 0) return [];
  return [
    {
      functionDeclarations: toolDefs.map((t) => ({
        name: t.function?.name,
        description: t.function?.description,
        parameters: t.function?.parameters,
      })),
    },
  ];
}

const REASONING_BUDGET: Record<string, number> = {
  none: 0,
  minimal: 512,
  low: 1024,
  medium: 8192,
  high: 24576,
  xhigh: 65536,
};

function buildRequestBody(
  modelId: string,
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>,
  identity: any,
  reasoningEffort: string | undefined,
  toolDefs: any[],
): Record<string, unknown> {
  const { system, contents } = toGeminiContents(messages);
  const body: Record<string, unknown> = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const genConfig: Record<string, unknown> = {};
  if (identity?.params?.temperature !== undefined) {
    genConfig.temperature = identity.params.temperature;
  }
  if (reasoningEffort) {
    genConfig.thinkingConfig = {
      thinkingBudget: REASONING_BUDGET[reasoningEffort] ?? 8192,
    };
  }
  if (Object.keys(genConfig).length > 0) body.generationConfig = genConfig;

  const tools = toGeminiTools(toolDefs);
  if (tools.length > 0) body.tools = tools;

  return body;
}

function extractText(response: any): string {
  const candidate = response?.candidates?.[0];
  const parts: Array<{ text?: string }> = candidate?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

export class GeminiAdapter implements ProviderAdapter {
  async streamChat(params: StreamChatParams): Promise<StreamChatResult> {
    const body = buildRequestBody(
      params.modelId,
      params.messages,
      params.identity,
      params.reasoningEffort,
      params.toolDefs ?? [],
    );
    const url = `${params.baseUrl.replace(/\/+$/, "")}/models/${params.modelId}:generateContent?alt=sse`;
    const response = await appFetch(url, {
      method: "POST",
      headers: { ...params.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API Error ${response.status}: ${text}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    const usage = await consumeGeminiGenerateContentSse(reader, params.onDelta, params.signal);
    return { usage };
  }

  async chat(params: ChatParams): Promise<string> {
    const body = buildRequestBody(params.modelId, params.messages, undefined, undefined, []);
    if (params.maxTokens) {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown>),
        maxOutputTokens: params.maxTokens,
      };
    }
    const url = `${params.baseUrl.replace(/\/+$/, "")}/models/${params.modelId}:generateContent`;
    const response = await appFetch(url, {
      method: "POST",
      headers: { ...params.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API Error ${response.status}: ${text}`);
    }
    return extractText(await response.json());
  }

  async probeCapabilities(params: ProbeParams): Promise<ProbeResult> {
    return {
      vision: true,
      toolCall: true,
      reasoning: /gemini-2\.5/i.test(params.modelId) || /thinking/i.test(params.modelId),
      streaming: true,
    };
  }
}
