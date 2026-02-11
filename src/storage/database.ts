import * as SQLite from "expo-sqlite";
import type { Message, Conversation } from "../types";

let db: SQLite.SQLiteDatabase | null = null;

async function getNativeDb() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("avatar.db");
  await db.execAsync(`
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
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content, senderName, content='messages', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, senderName)
      VALUES (new.rowid, new.content, new.senderName);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, senderName)
      VALUES ('delete', old.rowid, old.content, old.senderName);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, senderName)
      VALUES ('delete', old.rowid, old.content, old.senderName);
      INSERT INTO messages_fts(rowid, content, senderName)
      VALUES (new.rowid, new.content, new.senderName);
    END;
  `);
  return db;
}

// ─── Row converters ───
function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    type: row.type as Conversation["type"],
    title: row.title as string,
    participants: JSON.parse((row.participants as string) || "[]"),
    lastMessage: (row.lastMessage as string) ?? null,
    lastMessageAt: (row.lastMessageAt as string) ?? null,
    pinned: (row.pinned as number) === 1,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversationId as string,
    role: row.role as Message["role"],
    senderModelId: (row.senderModelId as string) ?? null,
    senderName: (row.senderName as string) ?? null,
    identityId: (row.identityId as string) ?? null,
    content: (row.content as string) || "",
    reasoningContent: (row.reasoningContent as string) ?? null,
    toolCalls: JSON.parse((row.toolCalls as string) || "[]"),
    toolResults: JSON.parse((row.toolResults as string) || "[]"),
    branchId: (row.branchId as string) ?? null,
    parentMessageId: (row.parentMessageId as string) ?? null,
    isStreaming: (row.isStreaming as number) === 1,
    createdAt: row.createdAt as string,
  };
}

// ─── Public API ───

export async function getDatabase() {
  return getNativeDb();
}

export async function insertConversation(conv: Conversation): Promise<void> {
  const database = await getNativeDb();
  await database.runAsync(
    `INSERT INTO conversations (id, type, title, participants, lastMessage, lastMessageAt, pinned, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    conv.id, conv.type, conv.title, JSON.stringify(conv.participants),
    conv.lastMessage, conv.lastMessageAt, conv.pinned ? 1 : 0, conv.createdAt, conv.updatedAt,
  );
}

export async function updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
  const database = await getNativeDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
  if (updates.participants !== undefined) { fields.push("participants = ?"); values.push(JSON.stringify(updates.participants)); }
  if (updates.lastMessage !== undefined) { fields.push("lastMessage = ?"); values.push(updates.lastMessage); }
  if (updates.lastMessageAt !== undefined) { fields.push("lastMessageAt = ?"); values.push(updates.lastMessageAt); }
  if (updates.pinned !== undefined) { fields.push("pinned = ?"); values.push(updates.pinned ? 1 : 0); }
  fields.push("updatedAt = ?"); values.push(new Date().toISOString());
  values.push(id);
  if (fields.length > 0) {
    await database.runAsync(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`, ...values);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const database = await getNativeDb();
  await database.runAsync("DELETE FROM messages WHERE conversationId = ?", id);
  await database.runAsync("DELETE FROM conversations WHERE id = ?", id);
}

export async function getAllConversations(): Promise<Conversation[]> {
  const database = await getNativeDb();
  const rows = await database.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM conversations ORDER BY pinned DESC, updatedAt DESC",
  );
  return rows.map(rowToConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const database = await getNativeDb();
  const row = await database.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM conversations WHERE id = ?", id,
  );
  return row ? rowToConversation(row) : null;
}

export async function insertMessage(msg: Message): Promise<void> {
  const database = await getNativeDb();
  await database.runAsync(
    `INSERT INTO messages (id, conversationId, role, senderModelId, senderName, identityId, content, reasoningContent, toolCalls, toolResults, branchId, parentMessageId, isStreaming, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    msg.id, msg.conversationId, msg.role, msg.senderModelId, msg.senderName, msg.identityId,
    msg.content, msg.reasoningContent, JSON.stringify(msg.toolCalls), JSON.stringify(msg.toolResults),
    msg.branchId, msg.parentMessageId, msg.isStreaming ? 1 : 0, msg.createdAt,
  );
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  const database = await getNativeDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.content !== undefined) { fields.push("content = ?"); values.push(updates.content); }
  if (updates.reasoningContent !== undefined) { fields.push("reasoningContent = ?"); values.push(updates.reasoningContent); }
  if (updates.toolCalls !== undefined) { fields.push("toolCalls = ?"); values.push(JSON.stringify(updates.toolCalls)); }
  if (updates.toolResults !== undefined) { fields.push("toolResults = ?"); values.push(JSON.stringify(updates.toolResults)); }
  if (updates.isStreaming !== undefined) { fields.push("isStreaming = ?"); values.push(updates.isStreaming ? 1 : 0); }
  values.push(id);
  if (fields.length > 0) {
    await database.runAsync(`UPDATE messages SET ${fields.join(", ")} WHERE id = ?`, ...values);
  }
}

export async function getMessages(
  conversationId: string,
  branchId?: string | null,
  limit = 100,
  offset = 0,
): Promise<Message[]> {
  const database = await getNativeDb();
  let query = "SELECT * FROM messages WHERE conversationId = ?";
  const params: (string | number | null)[] = [conversationId];
  if (branchId !== undefined) {
    query += " AND (branchId = ? OR branchId IS NULL)";
    params.push(branchId ?? null);
  }
  query += " ORDER BY createdAt ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const rows = await database.getAllAsync<Record<string, unknown>>(query, ...params);
  return rows.map(rowToMessage);
}

export async function searchMessages(query: string): Promise<Message[]> {
  const database = await getNativeDb();
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT m.* FROM messages m
     JOIN messages_fts fts ON m.rowid = fts.rowid
     WHERE messages_fts MATCH ?
     ORDER BY m.createdAt DESC LIMIT 50`,
    query,
  );
  return rows.map(rowToMessage);
}

export async function deleteMessage(id: string): Promise<void> {
  const database = await getNativeDb();
  await database.runAsync("DELETE FROM messages WHERE id = ?", id);
}
