import type { Message, Conversation } from "../types";

// Web platform: pure in-memory storage (no SQLite)
let memConversations: Conversation[] = [];
let memMessages: Message[] = [];

export async function getDatabase() {
  return null;
}

export async function insertConversation(conv: Conversation): Promise<void> {
  memConversations.push(conv);
}

export async function updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
  const idx = memConversations.findIndex((c) => c.id === id);
  if (idx >= 0) {
    memConversations[idx] = { ...memConversations[idx], ...updates, updatedAt: new Date().toISOString() };
  }
}

export async function deleteConversation(id: string): Promise<void> {
  memConversations = memConversations.filter((c) => c.id !== id);
  memMessages = memMessages.filter((m) => m.conversationId !== id);
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
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  const idx = memMessages.findIndex((m) => m.id === id);
  if (idx >= 0) {
    memMessages[idx] = { ...memMessages[idx], ...updates };
  }
}

export async function getMessages(
  conversationId: string,
  branchId?: string | null,
  limit = 100,
  offset = 0,
): Promise<Message[]> {
  let filtered = memMessages.filter((m) => m.conversationId === conversationId);
  if (branchId !== undefined) {
    filtered = filtered.filter((m) => m.branchId === branchId || m.branchId === null);
  }
  return filtered
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(offset, offset + limit);
}

export async function searchMessages(query: string): Promise<Message[]> {
  const q = query.toLowerCase();
  return memMessages
    .filter((m) => m.content.toLowerCase().includes(q))
    .slice(0, 50);
}

export async function deleteMessage(id: string): Promise<void> {
  memMessages = memMessages.filter((m) => m.id !== id);
}
