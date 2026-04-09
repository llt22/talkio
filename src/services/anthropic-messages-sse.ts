import type { StreamDelta } from "./provider-adapters/types";
import type { SseUsage } from "./openai-chat-sse";

/**
 * Consume an Anthropic Messages SSE stream, emitting normalized StreamDelta
 * events that the rest of the codebase already understands.
 *
 * Anthropic SSE events:
 *   message_start        → usage (input_tokens)
 *   content_block_start  → new content block (text / tool_use / thinking)
 *   content_block_delta  → incremental text / tool input / thinking
 *   content_block_stop   → block finished
 *   message_delta        → stop_reason, usage (output_tokens)
 *   message_stop         → end of stream
 */
export async function consumeAnthropicMessagesSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: StreamDelta) => void,
): Promise<SseUsage | null> {
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  // Track which indices are tool_use blocks
  const toolCallIndices = new Set<number>();
  let receivedData = false;
  let receivedMessageStop = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";

    for (const line of lines) {
      const trimmed = line.trim();

      // Track event type
      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.slice(6).trim();
        continue;
      }

      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      // Detect API-level errors embedded in stream
      if (parsed.type === "error" || parsed.error) {
        const errMsg =
          parsed.error?.message || parsed.error?.type || JSON.stringify(parsed.error || parsed);
        throw new Error(errMsg);
      }

      switch (parsed.type || currentEvent) {
        case "message_start": {
          const usage = parsed.message?.usage;
          if (usage?.input_tokens) inputTokens = usage.input_tokens;
          break;
        }

        case "content_block_start": {
          const block = parsed.content_block;
          const index = parsed.index ?? 0;
          if (block?.type === "tool_use") {
            toolCallIndices.add(index);
            onDelta({
              tool_calls: [
                {
                  index,
                  id: block.id,
                  function: { name: block.name, arguments: "" },
                },
              ],
            });
          }
          break;
        }

        case "content_block_delta": {
          const delta = parsed.delta;
          const index = parsed.index ?? 0;
          receivedData = true;

          if (delta?.type === "text_delta" && delta.text) {
            onDelta({ content: delta.text });
          } else if (delta?.type === "thinking_delta" && delta.thinking) {
            onDelta({ reasoning_content: delta.thinking });
          } else if (delta?.type === "input_json_delta" && delta.partial_json !== undefined) {
            if (toolCallIndices.has(index)) {
              onDelta({
                tool_calls: [
                  {
                    index,
                    function: { arguments: delta.partial_json },
                  },
                ],
              });
            }
          }
          break;
        }

        case "content_block_stop": {
          // Block finished — no action needed, tool call accumulation is handled incrementally
          break;
        }

        case "message_delta": {
          const usage = parsed.usage;
          if (usage?.output_tokens) outputTokens = usage.output_tokens;
          // input_tokens may also be updated here
          if (usage?.input_tokens) inputTokens = usage.input_tokens;
          break;
        }

        case "message_stop": {
          // Stream complete
          receivedMessageStop = true;
          break;
        }
      }
    }
  }

  // Stream interrupted: received data but no message_stop
  if (receivedData && !receivedMessageStop) {
    throw new Error("Stream interrupted: connection closed unexpectedly before completion");
  }

  if (inputTokens > 0 || outputTokens > 0) {
    return {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };
  }

  return null;
}
