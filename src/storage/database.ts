import { eq, desc, asc, and, or, isNull, like } from "drizzle-orm";
import { db, expoDb } from "../../db";
import { conversations, messages } from "../../db/schema";
import type { Message, Conversation } from "../types";

// ─── Init: ensure tables exist (Drizzle push or manual) ───
export async function initDatabase(): Promise<void> {
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'single',
      title TEXT NOT NULL DEFAULT '',
      participants TEXT NOT NULL DEFAULT '[]',
      lastMessage TEXT,
      lastMessageAt TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL,
      senderModelId TEXT,
      senderName TEXT,
      identityId TEXT,
      content TEXT NOT NULL DEFAULT '',
      reasoningContent TEXT,
      toolCalls TEXT NOT NULL DEFAULT '[]',
      toolResults TEXT NOT NULL DEFAULT '[]',
      branchId TEXT,
      parentMessageId TEXT,
      isStreaming INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId);
    CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(branchId);
  `);
}

// ─── Row converters ───
function rowToConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    type: row.type as Conversation["type"],
    title: row.title,
    participants: JSON.parse(row.participants || "[]"),
    lastMessage: row.lastMessage ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
    pinned: row.pinned === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as Message["role"],
    senderModelId: row.senderModelId ?? null,
    senderName: row.senderName ?? null,
    identityId: row.identityId ?? null,
    content: row.content || "",
    reasoningContent: row.reasoningContent ?? null,
    reasoningDuration: (row as any).reasoningDuration ?? null,
    toolCalls: JSON.parse(row.toolCalls || "[]"),
    toolResults: JSON.parse(row.toolResults || "[]"),
    branchId: row.branchId ?? null,
    parentMessageId: row.parentMessageId ?? null,
    isStreaming: row.isStreaming === 1,
    createdAt: row.createdAt,
  };
}

// ─── Conversations ───

export async function insertConversation(conv: Conversation): Promise<void> {
  await db.insert(conversations).values({
    id: conv.id,
    type: conv.type,
    title: conv.title,
    participants: JSON.stringify(conv.participants),
    lastMessage: conv.lastMessage,
    lastMessageAt: conv.lastMessageAt,
    pinned: conv.pinned ? 1 : 0,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  });
}

export async function updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (updates.title !== undefined) values.title = updates.title;
  if (updates.participants !== undefined) values.participants = JSON.stringify(updates.participants);
  if (updates.lastMessage !== undefined) values.lastMessage = updates.lastMessage;
  if (updates.lastMessageAt !== undefined) values.lastMessageAt = updates.lastMessageAt;
  if (updates.pinned !== undefined) values.pinned = updates.pinned ? 1 : 0;

  await db.update(conversations).set(values).where(eq(conversations.id, id));
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
}

export async function getAllConversations(): Promise<Conversation[]> {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
  return rows.map(rowToConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return rows.length > 0 ? rowToConversation(rows[0]) : null;
}

// ─── Messages ───

export async function insertMessage(msg: Message): Promise<void> {
  await db.insert(messages).values({
    id: msg.id,
    conversationId: msg.conversationId,
    role: msg.role,
    senderModelId: msg.senderModelId,
    senderName: msg.senderName,
    identityId: msg.identityId,
    content: msg.content,
    reasoningContent: msg.reasoningContent,
    toolCalls: JSON.stringify(msg.toolCalls),
    toolResults: JSON.stringify(msg.toolResults),
    branchId: msg.branchId,
    parentMessageId: msg.parentMessageId,
    isStreaming: msg.isStreaming ? 1 : 0,
    createdAt: msg.createdAt,
  });
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  const values: Record<string, unknown> = {};
  if (updates.content !== undefined) values.content = updates.content;
  if (updates.reasoningContent !== undefined) values.reasoningContent = updates.reasoningContent;
  if (updates.toolCalls !== undefined) values.toolCalls = JSON.stringify(updates.toolCalls);
  if (updates.toolResults !== undefined) values.toolResults = JSON.stringify(updates.toolResults);
  if (updates.isStreaming !== undefined) values.isStreaming = updates.isStreaming ? 1 : 0;

  if (Object.keys(values).length > 0) {
    await db.update(messages).set(values).where(eq(messages.id, id));
  }
}

export async function getMessages(
  conversationId: string,
  branchId?: string | null,
  limit = 100,
  offset = 0,
): Promise<Message[]> {
  const conditions = [eq(messages.conversationId, conversationId)];

  if (branchId !== undefined) {
    conditions.push(
      or(
        eq(messages.branchId, branchId ?? ""),
        isNull(messages.branchId),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(rowToMessage);
}

export async function searchMessages(query: string): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(like(messages.content, `%${query}%`))
    .orderBy(desc(messages.createdAt))
    .limit(50);
  return rows.map(rowToMessage);
}

export async function deleteMessage(id: string): Promise<void> {
  await db.delete(messages).where(eq(messages.id, id));
}

// Re-export for backward compat
export {
  updateMessage as dbUpdateMessage,
  deleteConversation as dbDeleteConversation,
  updateConversation as dbUpdateConversation,
  getMessages as dbGetMessages,
  searchMessages as dbSearchMessages,
  deleteMessage as dbDeleteMessage,
};
