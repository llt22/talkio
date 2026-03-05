import type {
  ProviderAdapter,
  StreamChatParams,
  StreamChatResult,
  ChatParams,
  ProbeParams,
  ProbeResult,
} from "./types";
import { consumeOpenAIChatCompletionsSse } from "../openai-chat-sse";
import { appFetch } from "../../lib/http";

function buildRequestBody(
  modelId: string,
  messages: Array<{ role: string; content: unknown }>,
  identity: any,
  reasoningEffort: string | undefined,
  toolDefs: any[],
): Record<string, unknown> {
  return {
    model: modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(identity?.params?.temperature !== undefined
      ? { temperature: identity.params.temperature }
      : {}),
    ...(identity?.params?.topP !== undefined ? { top_p: identity.params.topP } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
  };
}

export class ChatCompletionsAdapter implements ProviderAdapter {
  async streamChat(params: StreamChatParams): Promise<StreamChatResult> {
    const body = buildRequestBody(
      params.modelId,
      params.messages,
      params.identity,
      params.reasoningEffort,
      params.toolDefs ?? [],
    );

    const response = await appFetch(`${params.baseUrl}/chat/completions`, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const usage = await consumeOpenAIChatCompletionsSse(reader, params.onDelta);
    return { usage };
  }

  async chat(params: ChatParams): Promise<string> {
    const response = await appFetch(`${params.baseUrl}/chat/completions`, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify({
        model: params.modelId,
        messages: params.messages,
        stream: false,
        max_tokens: params.maxTokens ?? 1000,
        temperature: params.temperature ?? 0.2,
      }),
      signal: params.signal,
    });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response");
    return content;
  }

  async probeCapabilities(params: ProbeParams): Promise<ProbeResult> {
    const caps: ProbeResult = { vision: false, toolCall: false, reasoning: false, streaming: true };

    // Probe vision
    try {
      const res = await appFetch(`${params.baseUrl}/chat/completions`, {
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
                  type: "image_url",
                  image_url: {
                    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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
      const res = await appFetch(`${params.baseUrl}/chat/completions`, {
        method: "POST",
        headers: params.headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: params.modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
          tools: [
            {
              type: "function",
              function: {
                name: "test",
                description: "test",
                parameters: { type: "object", properties: {} },
              },
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
