import { describe, expect, it, vi } from "vitest";
import type { StreamingState } from "../chat-generation";

vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: () => null,
    get length() {
      return values.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;
});

import { clearConversationRuntime, skipCurrentParticipant } from "../chat-store-core";

describe("clearConversationRuntime", () => {
  it("aborts generation and removes only the cleared conversation streams", () => {
    const controller = new AbortController();
    const otherController = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");
    const abortControllers = new Map([
      ["conv-1", controller],
      ["conv-2", otherController],
    ]);
    const streamingMessages = new Map<string, StreamingState>([
      [
        "message-1",
        { cid: "conv-1", messageId: "message-1", content: "", reasoning: "Thinking", images: [] },
      ],
      [
        "message-2",
        { cid: "conv-2", messageId: "message-2", content: "other", reasoning: "", images: [] },
      ],
    ]);

    const participantAbortControllers = new Map([["conv-1", controller]]);
    const state = clearConversationRuntime(
      "conv-1",
      "conv-1",
      abortControllers,
      participantAbortControllers,
      streamingMessages,
    );

    expect(abortSpy).toHaveBeenCalledOnce();
    expect(abortControllers.has("conv-1")).toBe(false);
    expect(abortControllers.get("conv-2")).toBe(otherController);
    expect(participantAbortControllers.has("conv-1")).toBe(false);
    expect(streamingMessages.has("message-1")).toBe(false);
    expect(streamingMessages.has("message-2")).toBe(true);
    expect(state).toEqual({ isGenerating: false, canSkipCurrent: false, streamingMessages: [] });
  });

  it("cleans a background conversation without replacing the active UI streams", () => {
    const streamingMessages = new Map<string, StreamingState>([
      [
        "message-1",
        { cid: "conv-1", messageId: "message-1", content: "", reasoning: "Thinking", images: [] },
      ],
    ]);

    expect(
      clearConversationRuntime("conv-1", "conv-2", new Map(), new Map(), streamingMessages),
    ).toBeNull();
    expect(streamingMessages.size).toBe(0);
  });
});

describe("skipCurrentParticipant", () => {
  it("aborts only the active participant controller", () => {
    const current = new AbortController();
    const other = new AbortController();
    const controllers = new Map([
      ["conv-1", current],
      ["conv-2", other],
    ]);

    expect(skipCurrentParticipant("conv-1", controllers)).toBe(true);
    expect(current.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
    expect(controllers.has("conv-1")).toBe(false);
  });

  it("does nothing without a skippable participant", () => {
    expect(skipCurrentParticipant("conv-1", new Map())).toBe(false);
    expect(skipCurrentParticipant(null, new Map())).toBe(false);
  });
});
