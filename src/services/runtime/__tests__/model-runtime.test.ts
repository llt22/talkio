import { describe, it, expect, vi, type Mock } from "vitest";
import { NormalModelRuntime } from "../model-runtime";
import type { ProviderAdapter } from "../../provider-adapters";
import type { ParticipantRequest } from "../types";
import type { GenerationEvent } from "../events";

function makeAdapter(
  emit?: (params: { onDelta: (d: Record<string, unknown>) => void }) => void,
): ProviderAdapter {
  const streamChat = vi.fn();
  streamChat.mockImplementation(
    async ({ onDelta }: { onDelta: (d: Record<string, unknown>) => void }) => {
      emit?.({ onDelta });
      return { usage: null };
    },
  );
  return {
    streamChat: streamChat as unknown as ProviderAdapter["streamChat"],
    chat: vi.fn(),
    probeCapabilities: vi.fn(),
  };
}

function makeRequest(overrides: Partial<ParticipantRequest> = {}): ParticipantRequest {
  return {
    runId: "run-1",
    apiFormat: "chat-completions",
    baseUrl: "https://api.example.com/v1",
    headers: { Authorization: "Bearer x" },
    modelId: "gpt-4",
    messages: [{ role: "user", content: "hi" }],
    signal: new AbortController().signal,
    ...overrides,
  };
}

async function collect(gen: AsyncIterable<GenerationEvent>): Promise<GenerationEvent[]> {
  const events: GenerationEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("NormalModelRuntime", () => {
  it("routes to the adapter matching the apiFormat", async () => {
    const adapter = makeAdapter(({ onDelta }) => onDelta({ content: "hey" }));
    const runtime = new NormalModelRuntime(() => adapter);

    const events = await collect(runtime.run(makeRequest({ apiFormat: "anthropic-messages" })));

    expect(adapter.streamChat).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: "text-delta", text: "hey" });
  });

  it("starts with run-started carrying the runId", async () => {
    const runtime = new NormalModelRuntime(() => makeAdapter());
    const events = await collect(runtime.run(makeRequest({ runId: "run-42" })));
    expect(events[0]).toEqual({ type: "run-started", runId: "run-42" });
  });

  it("cancel aborts the in-flight request", async () => {
    const captured = { signal: null as AbortSignal | null };
    const adapter = makeAdapter();
    (adapter.streamChat as unknown as Mock).mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        captured.signal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    );
    const runtime = new NormalModelRuntime(() => adapter);

    const gen = runtime.run(makeRequest())[Symbol.asyncIterator]();
    const first = await gen.next(); // run-started
    // Second next() starts the underlying streamChat (it stays pending).
    const pendingNext = gen.next();
    await runtime.cancel("run-1");

    const rest = await pendingNext;
    expect(captured.signal?.aborted).toBe(true);
    expect(rest.done).toBe(false);
    expect(rest.value).toMatchObject({
      type: "run-failed",
      error: { code: "aborted" },
    });
  });

  it("forwards the caller's abort signal into the request", async () => {
    const adapter = makeAdapter();
    (adapter.streamChat as unknown as Mock).mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const runtime = new NormalModelRuntime(() => adapter);
    const caller = new AbortController();

    const gen = runtime.run(makeRequest({ signal: caller.signal }))[Symbol.asyncIterator]();
    await gen.next();
    caller.abort();

    const events: GenerationEvent[] = [];
    for (let r = await gen.next(); !r.done; r = await gen.next()) events.push(r.value);
    expect(events[events.length - 1]).toMatchObject({
      type: "run-failed",
      error: { code: "aborted" },
    });
  });

  it("allows a new run to reuse a runId after the previous run finished", async () => {
    const adapter = makeAdapter();
    const runtime = new NormalModelRuntime(() => adapter);

    await collect(runtime.run(makeRequest({ runId: "run-1" })));
    const events = await collect(runtime.run(makeRequest({ runId: "run-1" })));
    expect(events[0]).toEqual({ type: "run-started", runId: "run-1" });
  });
});
