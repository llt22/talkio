export interface SseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export async function consumeOpenAIChatCompletionsSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: any) => void,
): Promise<SseUsage | null> {
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: SseUsage | null = null;
  let receivedData = false;
  let receivedDone = false;
  let receivedFinishReason = false;

  while (true) {
    const { done, value } = await reader.read();
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
      // Detect API-level errors embedded in SSE stream
      if (parsed.error) {
        const errMsg = parsed.error.message || parsed.error.code || JSON.stringify(parsed.error);
        throw new Error(errMsg);
      }
      if (parsed.usage) usage = parsed.usage;
      const choice = parsed.choices?.[0];
      if (choice?.finish_reason) receivedFinishReason = true;
      const delta = choice?.delta;
      if (!delta) continue;
      receivedData = true;
      onDelta(delta);
    }
  }

  // Stream interrupted: received data but no completion signal
  if (receivedData && !receivedDone && !receivedFinishReason && !usage) {
    throw new Error("Stream interrupted: connection closed unexpectedly before completion");
  }

  return usage;
}
