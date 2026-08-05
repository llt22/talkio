import { describe, it, expect } from "vitest";
import { computeParticipantStats, formatTokenCount } from "../participant-stats";
import type { Message } from "../../types";
import { MessageStatus } from "../../types";

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: "m",
    conversationId: "c",
    role: "assistant",
    senderModelId: "m1",
    senderName: "Alice",
    identityId: null,
    participantId: null,
    content: "hi",
    reasoningContent: null,
    reasoningDuration: null,
    images: [],
    generatedImages: [],
    toolCalls: [],
    toolResults: [],
    branchId: null,
    parentMessageId: null,
    isStreaming: false,
    status: MessageStatus.SUCCESS,
    errorMessage: null,
    tokenUsage: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeParticipantStats", () => {
  it("aggregates tokens and tool calls per participant", () => {
    const messages = [
      makeMessage({
        participantId: "p1",
        tokenUsage: { inputTokens: 100, outputTokens: 20 },
        toolCalls: [{ id: "t1", name: "a", arguments: "{}" }],
      }),
      makeMessage({
        participantId: "p1",
        tokenUsage: { inputTokens: 50, outputTokens: 10 },
        toolCalls: [],
      }),
      makeMessage({
        participantId: "p2",
        tokenUsage: { inputTokens: 7, outputTokens: 3 },
        toolCalls: [
          { id: "t1", name: "a", arguments: "{}" },
          { id: "t2", name: "b", arguments: "{}" },
        ],
      }),
    ];

    const stats = computeParticipantStats(messages);

    expect(stats.get("p1")).toEqual({
      messageCount: 2,
      inputTokens: 150,
      outputTokens: 30,
      toolCalls: 1,
    });
    expect(stats.get("p2")).toEqual({
      messageCount: 1,
      inputTokens: 7,
      outputTokens: 3,
      toolCalls: 2,
    });
  });

  it("skips user messages and messages without a participant", () => {
    const messages = [
      makeMessage({
        participantId: "p1",
        role: "user",
        tokenUsage: { inputTokens: 999, outputTokens: 999 },
      }),
      makeMessage({ participantId: null, tokenUsage: { inputTokens: 999, outputTokens: 999 } }),
    ];
    const stats = computeParticipantStats(messages);
    expect(stats.size).toBe(0);
  });

  it("tolerates missing token usage", () => {
    const stats = computeParticipantStats([makeMessage({ participantId: "p1", tokenUsage: null })]);
    expect(stats.get("p1")).toEqual({
      messageCount: 1,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
    });
  });
});

describe("formatTokenCount", () => {
  it("formats magnitudes", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1234)).toBe("1.2k");
    expect(formatTokenCount(12345)).toBe("12.3k");
    expect(formatTokenCount(1234567)).toBe("1.2M");
  });
});
