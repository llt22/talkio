import { useMemo } from "react";
import { eq, asc, and, isNull } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { db } from "../../db";
import { messages } from "../../db/schema";
import { rowToMessage } from "../storage/database";
import type { Message } from "../types";

// Stable empty query for when conversationId is not available
const EMPTY_QUERY = db
  .select()
  .from(messages)
  .where(eq(messages.conversationId, "__none__"))
  .limit(0);

/**
 * Reactive hook that returns messages for a conversation from SQLite.
 * Uses useLiveQuery so the UI automatically updates when DB changes.
 */
export function useMessages(
  conversationId: string | null,
  branchId?: string | null,
): Message[] {
  const query = useMemo(() => {
    if (!conversationId) return EMPTY_QUERY;
    const conditions = [eq(messages.conversationId, conversationId)];
    if (branchId) {
      conditions.push(eq(messages.branchId, branchId));
    } else {
      conditions.push(isNull(messages.branchId));
    }
    return db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.createdAt));
  }, [conversationId, branchId]);

  const { data: rawMessages } = useLiveQuery(query, [conversationId, branchId]);

  return useMemo(
    () => (rawMessages ? rawMessages.map(rowToMessage) : []),
    [rawMessages],
  );
}
