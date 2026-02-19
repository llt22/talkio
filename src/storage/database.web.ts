import type { Message, Conversation } from "../types";

// Web platform: localStorage-backed storage (no SQLite)
const CONV_KEY = "@avatar:web:conversations";
const MSG_KEY = "@avatar:web:messages";

let memConversations: Conversation[] = [];
let memMessages: Message[] = [];

function persist() {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(memConversations));
    localStorage.setItem(MSG_KEY, JSON.stringify(memMessages));
  } catch {
    // localStorage full or unavailable
  }
}

export async function initDatabase(): Promise<void> {
  try {
    const convJson = localStorage.getItem(CONV_KEY);
    const msgJson = localStorage.getItem(MSG_KEY);
    if (convJson) memConversations = JSON.parse(convJson);
    if (msgJson) memMessages = JSON.parse(msgJson);
  } catch {
    // fresh start
  }
}

export async function getDatabase() {
  return null;
}

export async function insertConversation(conv: Conversation): Promise<void> {
  memConversations.push(conv);
  persist();
}

export async function updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
  const idx = memConversations.findIndex((c) => c.id === id);
  if (idx >= 0) {
    memConversations[idx] = { ...memConversations[idx], ...updates, updatedAt: new Date().toISOString() };
    persist();
  }
}

export async function deleteConversation(id: string): Promise<void> {
  memConversations = memConversations.filter((c) => c.id !== id);
  memMessages = memMessages.filter((m) => m.conversationId !== id);
  persist();
}

export async function getAllConversations(): Promise<Conversation[]> {
  return [...memConversations].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return memConversations.find((c) => c.id === id) ?? null;
}

export async function insertMessage(msg: Message): Promise<void> {
  memMessages.push(msg);
  persist();
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  const idx = memMessages.findIndex((m) => m.id === id);
  if (idx >= 0) {
    memMessages[idx] = { ...memMessages[idx], ...updates };
    persist();
  }
}

export async function getMessages(
  conversationId: string,
  branchId?: string | null,
  limit = 100,
  offset = 0,
): Promise<Message[]> {
  let filtered = memMessages.filter((m) => m.conversationId === conversationId);
  if (branchId) {
    filtered = filtered.filter((m) => m.branchId === branchId);
  } else {
    filtered = filtered.filter((m) => m.branchId === null);
  }
  return filtered
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(offset, offset + limit);
}

export async function getRecentMessages(
  conversationId: string,
  branchId?: string | null,
  limit = 40,
): Promise<Message[]> {
  let filtered = memMessages.filter((m) => m.conversationId === conversationId);
  if (branchId) {
    filtered = filtered.filter((m) => m.branchId === branchId);
  } else {
    filtered = filtered.filter((m) => m.branchId === null);
  }
  return filtered
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .reverse();
}

export async function getMessagesBefore(
  conversationId: string,
  branchId: string | null | undefined,
  before: string,
  limit = 40,
): Promise<Message[]> {
  let filtered = memMessages.filter((m) => m.conversationId === conversationId && m.createdAt < before);
  if (branchId) {
    filtered = filtered.filter((m) => m.branchId === branchId);
  } else {
    filtered = filtered.filter((m) => m.branchId === null);
  }
  return filtered
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .reverse();
}

export const dbGetRecentMessages = getRecentMessages;
export const dbGetMessagesBefore = getMessagesBefore;

export async function searchMessages(query: string): Promise<Message[]> {
  const q = query.toLowerCase();
  return memMessages
    .filter((m) => m.content.toLowerCase().includes(q))
    .slice(0, 50);
}

export async function deleteMessage(id: string): Promise<void> {
  memMessages = memMessages.filter((m) => m.id !== id);
  persist();
}
