/**
 * Reactive data hooks — replaces drizzle useLiveQuery.
 * Uses polling + zustand subscription to keep UI in sync with SQLite.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllConversations,
  getConversation,
  getRecentMessages,
  getBlocksByMessageId,
} from "../storage/database";
import type { Conversation, Message, MessageBlock } from "../types";

const DEFAULT_MESSAGE_LIMIT = 200;

// Global event emitter for DB changes
export type DbChangeChannel = "all" | "conversations" | "messages" | "blocks";
type DbChangeEvent = { channel: DbChangeChannel; id?: string };
type Listener = (event: DbChangeEvent) => void;
const listeners = new Set<Listener>();
export function notifyDbChange(channel: DbChangeChannel = "all", id?: string) {
  const event: DbChangeEvent = { channel, id };
  listeners.forEach((fn) => fn(event));
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
    const listener: Listener = (e) => {
      if (e.channel === "all" || e.channel === "conversations") load();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [load]);

  return convs;
}

export function useConversation(conversationId: string | null): Conversation | null {
  const [conv, setConv] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) {
      setConv(null);
      return;
    }
    try {
      const data = await getConversation(conversationId);
      setConv(data);
    } catch {
      // DB not ready
    }
  }, [conversationId]);

  useEffect(() => {
    load();
    const listener: Listener = (e) => {
      if (e.channel === "all" || e.channel === "conversations") load();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [load]);

  return conv;
}

export function useMessages(conversationId: string | null, branchId?: string | null): Message[] {
  const [msgs, setMsgs] = useState<Message[]>([]);

  const load = useCallback(async () => {
    if (!conversationId) {
      setMsgs([]);
      return;
    }
    try {
      const data = await getRecentMessages(conversationId, branchId, DEFAULT_MESSAGE_LIMIT);
      setMsgs(data);
    } catch {
      // DB not ready
    }
  }, [conversationId, branchId]);

  useEffect(() => {
    load();
    const listener: Listener = (e) => {
      if (e.channel === "all") return load();
      if (e.channel === "messages" && conversationId && e.id === conversationId) return load();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [load]);

  return msgs;
}

export function useMessageBlocks(messageId: string | null): MessageBlock[] {
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);

  const load = useCallback(async () => {
    if (!messageId) {
      setBlocks([]);
      return;
    }
    try {
      const data = await getBlocksByMessageId(messageId);
      setBlocks(data);
    } catch {
      // DB not ready
    }
  }, [messageId]);

  useEffect(() => {
    load();
    const listener: Listener = (e) => {
      if (e.channel === "all") return load();
      if (e.channel === "blocks" && messageId && e.id === messageId) return load();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [load]);

  return blocks;
}
