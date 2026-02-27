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
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.usage) usage = parsed.usage;
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;
        onDelta(delta);
      } catch {
        // ignore
      }
    }
  }

  return usage;
}
