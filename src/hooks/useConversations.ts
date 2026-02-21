import { useMemo } from "react";
import { desc } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { db } from "../../db";
import { conversations } from "../../db/schema";
import { rowToConversation } from "../storage/database";
import type { Conversation } from "../types";

/**
 * Reactive hook that returns all conversations from SQLite.
 * Uses useLiveQuery so the UI automatically updates when DB changes.
 */
export function useConversations(): Conversation[] {
  const query = useMemo(
    () =>
      db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.pinned), desc(conversations.updatedAt)),
    [],
  );

  const { data: rawConversations } = useLiveQuery(query);

  return useMemo(
    () => (rawConversations ? rawConversations.map(rowToConversation) : []),
    [rawConversations],
  );
}
