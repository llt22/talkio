import type {
  ProviderAdapter,
  StreamChatParams,
  StreamChatResult,
  ChatParams,
  ProbeParams,
  ProbeResult,
} from "./types";
import { consumeOpenAIResponsesSse } from "../openai-responses-sse";
import { appFetch } from "../../lib/http";

/**
 * Convert Chat Completions-style messages to Responses API input format.
 */
function convertMessagesToInput(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>,
): any[] {
  const input: any[] = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      input.push({ role: "developer", content: msg.content });
    } else if (msg.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id || "",
        output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
    } else if (msg.role === "assistant" && msg.tool_calls) {
      const toolCalls = msg.tool_calls as Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      for (const tc of toolCalls) {
        input.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
      if (msg.content) {
        input.push({ role: "assistant", content: msg.content });
      }
    } else {
      input.push({ role: msg.role, content: msg.content });
    }
  }
  return input;
}

function buildRequestBody(
  modelId: string,
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>,
  identity: any,
  reasoningEffort: string | undefined,
  toolDefs: any[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: modelId,
    input: convertMessagesToInput(messages),
    stream: true,
  };

  if (identity?.params?.temperature !== undefined) {
    body.temperature = identity.params.temperature;
  }
  if (identity?.params?.topP !== undefined) {
    body.top_p = identity.params.topP;
  }
  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }
  if (toolDefs.length > 0) {
    body.tools = toolDefs;
  }

  return body;
}

export class ResponsesAdapter implements ProviderAdapter {
  async streamChat(params: StreamChatParams): Promise<StreamChatResult> {
    const body = buildRequestBody(
      params.modelId,
      params.messages,
      params.identity,
      params.reasoningEffort,
      params.toolDefs ?? [],
    );

    const response = await appFetch(`${params.baseUrl}/responses`, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const usage = await consumeOpenAIResponsesSse(reader, params.onDelta);
    return { usage };
  }

  async chat(params: ChatParams): Promise<string> {
    const response = await appFetch(`${params.baseUrl}/responses`, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify({
        model: params.modelId,
        input: params.messages.map((m) =>
          m.role === "system"
            ? { role: "developer", content: m.content }
            : { role: m.role, content: m.content },
        ),
        stream: false,
        max_output_tokens: params.maxTokens ?? 1000,
        temperature: params.temperature ?? 0.2,
      }),
      signal: params.signal,
    });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const content = data.output
      ?.find((o: any) => o.type === "message")
      ?.content?.find((c: any) => c.type === "output_text")
      ?.text?.trim();
    if (!content) throw new Error("Empty response");
    return content;
  }

  async probeCapabilities(params: ProbeParams): Promise<ProbeResult> {
    const caps: ProbeResult = { vision: false, toolCall: false, reasoning: false, streaming: true };

    // Probe vision
    try {
      const res = await appFetch(`${params.baseUrl}/responses`, {
        method: "POST",
        headers: params.headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: params.modelId,
          max_output_tokens: 1,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: "hi" },
                {
                  type: "input_image",
                  image_url:
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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
      const res = await appFetch(`${params.baseUrl}/responses`, {
        method: "POST",
        headers: params.headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: params.modelId,
          max_output_tokens: 1,
          input: [{ role: "user", content: "hi" }],
          tools: [
            {
              type: "function",
              name: "test",
              description: "test",
              parameters: { type: "object", properties: {} },
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
