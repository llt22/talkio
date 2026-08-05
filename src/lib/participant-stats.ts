/**
 * Participant-level usage aggregation — per-member token and tool-call
 * observability for group chats.
 */
import type { Message } from "../types";

export interface ParticipantStats {
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

/** Aggregate message-level usage into per-participant stats. */
export function computeParticipantStats(messages: Message[]): Map<string, ParticipantStats> {
  const stats = new Map<string, ParticipantStats>();
  for (const message of messages) {
    if (!message.participantId || message.role !== "assistant") continue;
    const entry = stats.get(message.participantId) ?? {
      messageCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
    };
    entry.messageCount += 1;
    if (message.tokenUsage) {
      entry.inputTokens += message.tokenUsage.inputTokens ?? 0;
      entry.outputTokens += message.tokenUsage.outputTokens ?? 0;
    }
    entry.toolCalls += message.toolCalls?.length ?? 0;
    stats.set(message.participantId, entry);
  }
  return stats;
}

/** Compact human-readable token total, e.g. 12345 → "12.3k". */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}
