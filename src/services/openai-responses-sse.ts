import type { SseUsage } from "./openai-chat-sse";

export interface ResponsesDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/**
 * Consume an OpenAI Responses API SSE stream and emit normalized deltas
 * compatible with the existing chat-generation delta handler.
 *
 * Responses API uses named events (event: xxx\ndata: {...}\n\n) instead of
 * the Chat Completions format (data: {...}\n\n).
 *
 * Key events we handle:
 * - response.output_text.delta       → content delta
 * - response.reasoning_summary_text.delta → reasoning delta
 * - response.function_call_arguments.delta → tool call arguments
 * - response.output_item.added       → new output item (function_call → tool id/name)
 * - response.completed               → usage stats
 */
export async function consumeOpenAIResponsesSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: ResponsesDelta) => void,
): Promise<SseUsage | null> {
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: SseUsage | null = null;
  let receivedData = false;
  let receivedCompleted = false;

  // Track function call items by output_index for streaming arguments
  const functionCalls = new Map<number, { id: string; name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    for (const line of lines) {
      const trimmed = line.trim();

      // Parse event type
      if (trimmed.startsWith("event: ")) {
        currentEvent = trimmed.slice(7).trim();
        continue;
      }

      // Parse data
      if (!trimmed.startsWith("data: ")) {
        if (trimmed === "") currentEvent = "";
        continue;
      }

      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") continue;

      let parsed: any;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      // Detect API-level errors embedded in SSE stream
      if (parsed.error) {
        const errMsg = parsed.error.message || parsed.error.code || JSON.stringify(parsed.error);
        throw new Error(errMsg);
      }

      switch (currentEvent) {
        case "response.output_text.delta": {
          const delta = parsed.delta;
          if (typeof delta === "string" && delta) {
            receivedData = true;
            onDelta({ content: delta });
          }
          break;
        }

        case "response.reasoning_summary_text.delta": {
          const delta = parsed.delta;
          if (typeof delta === "string" && delta) {
            onDelta({ reasoning_content: delta });
          }
          break;
        }

        // GPT-OSS reasoning text (not summary)
        case "response.reasoning_text.delta": {
          const delta = parsed.delta;
          if (typeof delta === "string" && delta) {
            onDelta({ reasoning_content: delta });
          }
          break;
        }

        case "response.output_item.added": {
          const item = parsed.item;
          if (item?.type === "function_call") {
            const idx = parsed.output_index ?? 0;
            functionCalls.set(idx, {
              id: item.call_id || item.id || "",
              name: item.name || "",
              arguments: "",
            });
            // Emit initial tool call delta with id and name
            onDelta({
              tool_calls: [{
                index: idx,
                id: item.call_id || item.id || "",
                function: { name: item.name || "" },
              }],
            });
          }
          break;
        }

        case "response.function_call_arguments.delta": {
          const delta = parsed.delta;
          const idx = parsed.output_index ?? 0;
          if (typeof delta === "string" && delta) {
            const fc = functionCalls.get(idx);
            if (fc) fc.arguments += delta;
            onDelta({
              tool_calls: [{
                index: idx,
                function: { arguments: delta },
              }],
            });
          }
          break;
        }

        case "response.completed": {
          receivedCompleted = true;
          if (parsed.response?.usage) {
            const u = parsed.response.usage;
            usage = {
              prompt_tokens: u.input_tokens ?? 0,
              completion_tokens: u.output_tokens ?? 0,
              total_tokens: u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
            };
          }
          break;
        }

        default:
          // Ignore other events (response.created, response.in_progress, etc.)
          break;
      }

      currentEvent = "";
    }
  }

  // Stream interrupted: received data but no response.completed
  if (receivedData && !receivedCompleted) {
    throw new Error("Stream interrupted: connection closed unexpectedly before completion");
  }

  return usage;
}

