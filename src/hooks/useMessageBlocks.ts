import { useMemo } from "react";
import { eq, asc } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { db } from "../../db";
import { messageBlocks, messages } from "../../db/schema";
import { rowToBlock } from "../storage/database";
import type { MessageBlock } from "../types";

/**
 * Reactive hook that returns all message blocks for a conversation,
 * grouped by messageId. Uses useLiveQuery so the UI automatically
 * updates when any block in the conversation changes.
 *
 * Inspired by cherry-studio-app's useTopicBlocks pattern.
 */
export function useConversationBlocks(
  conversationId: string | null,
): Record<string, MessageBlock[]> {
  const query = useMemo(() => {
    if (!conversationId) {
      // Return a query that yields no results
      return db
        .select({ block: messageBlocks })
        .from(messageBlocks)
        .where(eq(messageBlocks.messageId, "__none__"))
        .limit(0);
    }
    return db
      .select({ block: messageBlocks })
      .from(messageBlocks)
      .innerJoin(messages, eq(messageBlocks.messageId, messages.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messageBlocks.sortOrder));
  }, [conversationId]);

  const { data: rawData } = useLiveQuery(query, [conversationId]);

  return useMemo(() => {
    if (!rawData || rawData.length === 0) return {};

    const grouped: Record<string, MessageBlock[]> = {};
    for (const { block } of rawData) {
      const converted = rowToBlock(block);
      if (!grouped[converted.messageId]) {
        grouped[converted.messageId] = [];
      }
      grouped[converted.messageId].push(converted);
    }
    return grouped;
  }, [rawData]);
}
