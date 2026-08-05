import { describe, it, expect, vi } from "vitest";

// chat-message-builder imports provider/identity stores at module load, which
// touch localStorage — install a memory stub first.
vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;
});

import { resolveTargetParticipants } from "../chat-message-builder";
import type { Conversation, ConversationParticipant } from "../../types";

function makeConv(
  participants: ConversationParticipant[],
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: "c",
    title: "T",
    type: "group",
    participants,
    lastMessage: null,
    lastMessageAt: null,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const alice: ConversationParticipant = {
  id: "p1",
  modelId: "m1",
  identityId: null,
  nickname: "Alice",
};
const bob: ConversationParticipant = { id: "p2", modelId: "m2", identityId: null, nickname: "Bob" };
const mutedBob: ConversationParticipant = { ...bob, muted: true };

describe("resolveTargetParticipants muting", () => {
  it("skips muted participants in automatic rounds", () => {
    const targets = resolveTargetParticipants(makeConv([alice, mutedBob]));
    expect(targets.map((p) => p.id)).toEqual(["p1"]);
  });

  it("explicit user mentions still reach muted participants", () => {
    const targets = resolveTargetParticipants(makeConv([alice, mutedBob]), ["p2"]);
    expect(targets.map((p) => p.id)).toEqual(["p2"]);
  });

  it("keeps the mute filter under random speaking order", () => {
    const targets = resolveTargetParticipants(
      makeConv([alice, mutedBob, { ...bob, id: "p3", muted: false }], { speakingOrder: "random" }),
    );
    const ids = targets.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["p1", "p3"]));
    expect(ids).not.toContain("p2");
  });

  it("does not affect single conversations", () => {
    const single = makeConv([alice], { type: "single" });
    expect(resolveTargetParticipants(single)).toEqual([alice]);
  });
});
