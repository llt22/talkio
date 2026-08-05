/**
 * Gemini GenerateContent SSE consumer.
 *
 * Stream format (streamGenerateContent / alt=sse):
 *   data: {"candidates":[{"content":{"role":"model","parts":[{"text":"..."}]},
 *          "finishReason":"STOP","index":0}],
 *          "usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}
 *   data: [DONE]
 *
 * Tool calls arrive as complete `functionCall` parts (not incremental), which
 * are mapped to the normalized single-chunk tool_calls delta.
 */
import type { StreamDelta } from "./provider-adapters/types";
import { readWithAbort } from "./sse-utils";

export interface SseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface GeminiFunctionCall {
  name?: string;
  args?: Record<string, unknown>;
}

export async function consumeGeminiGenerateContentSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: StreamDelta) => void,
  signal: AbortSignal,
): Promise<SseUsage | null> {
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: SseUsage | null = null;
  let receivedData = false;
  let receivedDone = false;
  let receivedFinishReason = false;

  while (true) {
    const { done, value } = await readWithAbort(reader, signal);
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        receivedDone = true;
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // ignore malformed JSON
      }
      if (parsed.error) {
        const errMsg = parsed.error.message || parsed.error.code || JSON.stringify(parsed.error);
        throw new Error(errMsg);
      }
      if (parsed.usageMetadata) {
        usage = {
          prompt_tokens: parsed.usageMetadata.promptTokenCount ?? 0,
          completion_tokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
          total_tokens: parsed.usageMetadata.totalTokenCount ?? 0,
        };
      }
      const candidate = parsed.candidates?.[0];
      if (candidate?.finishReason) receivedFinishReason = true;
      const parts: Array<{ text?: string; functionCall?: GeminiFunctionCall }> =
        candidate?.content?.parts ?? [];
      if (parts.length === 0) continue;
      receivedData = true;

      let text = "";
      const toolCalls: NonNullable<StreamDelta["tool_calls"]> = [];
      for (const part of parts) {
        if (typeof part.text === "string") text += part.text;
        if (part.functionCall) {
          toolCalls.push({
            index: toolCalls.length,
            function: {
              name: part.functionCall.name ?? "",
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        }
      }
      if (text) onDelta({ content: text });
      if (toolCalls.length > 0) onDelta({ tool_calls: toolCalls });
    }
  }

  // Stream interrupted: received content but no completion signal
  if (receivedData && !receivedDone && !receivedFinishReason && !usage) {
    throw new Error("Stream interrupted: connection closed unexpectedly before completion");
  }

  return usage;
}
