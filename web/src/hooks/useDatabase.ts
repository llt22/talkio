/**
 * Reactive data hooks — replaces drizzle useLiveQuery.
 * Uses polling + zustand subscription to keep UI in sync with SQLite.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllConversations,
  getRecentMessages,
  getBlocksByMessageId,
} from "../storage/database";
import type { Conversation, Message, MessageBlock } from "../../../src/types";

// Global event emitter for DB changes
type Listener = () => void;
const listeners = new Set<Listener>();
export function notifyDbChange() {
  listeners.forEach((fn) => fn());
}

export function useConversations(): Conversation[] {
  const [convs, setConvs] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getAllConversations();
      setConvs(data);
    } catch {
      // DB not ready yet
    }
  }, []);

  useEffect(() => {
    load();
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, [load]);

  return convs;
}

export function useMessages(conversationId: string | null, branchId?: string | null): Message[] {
  const [msgs, setMsgs] = useState<Message[]>([]);

  const load = useCallback(async () => {
    if (!conversationId) { setMsgs([]); return; }
    try {
      const data = await getRecentMessages(conversationId, branchId, 200);
      setMsgs(data);
    } catch {
      // DB not ready
    }
  }, [conversationId, branchId]);

  useEffect(() => {
    load();
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, [load]);

  return msgs;
}

export function useMessageBlocks(messageId: string | null): MessageBlock[] {
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);

  const load = useCallback(async () => {
    if (!messageId) { setBlocks([]); return; }
    try {
      const data = await getBlocksByMessageId(messageId);
      setBlocks(data);
    } catch {
      // DB not ready
    }
  }, [messageId]);

  useEffect(() => {
    load();
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, [load]);

  return blocks;
}
