import { eq, desc, asc, and, or, isNull, like, lt } from "drizzle-orm";
import { db, expoDb } from "../../db";
import { conversations, messages, messageBlocks } from "../../db/schema";
import type { Message, Conversation, ConversationParticipant, MessageBlock } from "../types";
import { MessageStatus, MessageBlockType, MessageBlockStatus } from "../types";
import { generateId } from "../utils/id";

// ─── Migration System ───

interface Migration {
  version: number;
  sql: string;
}

// Each migration runs exactly once, tracked by version number in _migrations table.
// Add new migrations to the END of this array. Never modify or remove existing entries.
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `ALTER TABLE messages ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`,
  },
  {
    version: 2,
    sql: `ALTER TABLE messages ADD COLUMN generatedImages TEXT NOT NULL DEFAULT '[]'`,
  },
  {
    version: 3,
    sql: `ALTER TABLE messages ADD COLUMN reasoningDuration REAL`,
  },
  {
    version: 4,
    sql: `ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'success'`,
  },
  {
    version: 5,
    sql: `ALTER TABLE messages ADD COLUMN errorMessage TEXT`,
  },
  {
    version: 6,
    sql: `ALTER TABLE messages ADD COLUMN tokenUsage TEXT`,
  },
];

function getAppliedVersions(): Set<number> {
  try {
    const rows = expoDb.getAllSync<{ version: number }>(
      `SELECT version FROM _migrations`,
    );
    return new Set(rows.map((r) => r.version));
  } catch {
    return new Set();
  }
}

function runMigrations(): void {
  // Ensure meta table exists
  expoDb.execSync(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const applied = getAppliedVersions();

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    try {
      expoDb.execSync(migration.sql);
    } catch {
      // Column/index may already exist from before the migration system was introduced.
      // This is expected for the initial adoption — safe to ignore.
    }
    expoDb.runSync(
      `INSERT OR IGNORE INTO _migrations (version, applied_at) VALUES (?, ?)`,
      [migration.version, new Date().toISOString()],
    );
  }
}

// ─── Init: ensure tables exist + run migrations ───
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
      images TEXT NOT NULL DEFAULT '[]',
      generatedImages TEXT NOT NULL DEFAULT '[]',
      reasoningDuration REAL,
      isStreaming INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      errorMessage TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId);
    CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(branchId);
    CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversationId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_messages_conv_branch_created ON messages(conversationId, branchId, createdAt);

    CREATE TABLE IF NOT EXISTS message_blocks (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'main_text',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      metadata TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_message ON message_blocks(messageId);
    CREATE INDEX IF NOT EXISTS idx_blocks_message_order ON message_blocks(messageId, sortOrder);
  `);

  // Run versioned migrations for existing databases
  runMigrations();
}

const EMPTY_ARRAY: readonly never[] = [];

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  if (value === "[]") return EMPTY_ARRAY as unknown as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ─── Row converters ───
export function rowToConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    type: row.type as Conversation["type"],
    title: row.title,
    participants: (JSON.parse(row.participants || "[]") as ConversationParticipant[]).map(
      (p) => (p.id ? p : { ...p, id: generateId() }),
    ),
    lastMessage: row.lastMessage ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
    pinned: row.pinned === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as Message["role"],
    senderModelId: row.senderModelId ?? null,
    senderName: row.senderName ?? null,
    identityId: row.identityId ?? null,
    content: row.content || "",
    images: safeJsonParse<string[]>(row.images, []),
    generatedImages: safeJsonParse<string[]>(row.generatedImages, []),
    reasoningContent: row.reasoningContent ?? null,
    reasoningDuration: row.reasoningDuration ?? null,
    toolCalls: safeJsonParse(row.toolCalls, []),
    toolResults: safeJsonParse(row.toolResults, []),
    branchId: row.branchId ?? null,
    parentMessageId: row.parentMessageId ?? null,
    isStreaming: row.isStreaming === 1,
    status: (row.status as MessageStatus) || (row.isStreaming === 1 ? MessageStatus.STREAMING : MessageStatus.SUCCESS),
    errorMessage: row.errorMessage ?? null,
    tokenUsage: safeJsonParse(row.tokenUsage, null),
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
  if (updates.type !== undefined) values.type = updates.type;
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
    images: JSON.stringify(msg.images ?? []),
    generatedImages: JSON.stringify(msg.generatedImages ?? []),
    reasoningContent: msg.reasoningContent,
    reasoningDuration: msg.reasoningDuration,
    toolCalls: JSON.stringify(msg.toolCalls),
    toolResults: JSON.stringify(msg.toolResults),
    branchId: msg.branchId,
    parentMessageId: msg.parentMessageId,
    isStreaming: msg.isStreaming ? 1 : 0,
    status: msg.status ?? MessageStatus.SUCCESS,
    errorMessage: msg.errorMessage ?? null,
    tokenUsage: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
    createdAt: msg.createdAt,
  });
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  const values: Record<string, unknown> = {};
  if (updates.content !== undefined) values.content = updates.content;
  if (updates.images !== undefined) values.images = JSON.stringify(updates.images);
  if (updates.generatedImages !== undefined) values.generatedImages = JSON.stringify(updates.generatedImages);
  if (updates.reasoningContent !== undefined) values.reasoningContent = updates.reasoningContent;
  if (updates.reasoningDuration !== undefined) values.reasoningDuration = updates.reasoningDuration;
  if (updates.toolCalls !== undefined) values.toolCalls = JSON.stringify(updates.toolCalls);
  if (updates.toolResults !== undefined) values.toolResults = JSON.stringify(updates.toolResults);
  if (updates.isStreaming !== undefined) values.isStreaming = updates.isStreaming ? 1 : 0;
  if (updates.status !== undefined) values.status = updates.status;
  if (updates.errorMessage !== undefined) values.errorMessage = updates.errorMessage;
  if (updates.tokenUsage !== undefined) values.tokenUsage = updates.tokenUsage ? JSON.stringify(updates.tokenUsage) : null;

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

  if (branchId) {
    conditions.push(eq(messages.branchId, branchId));
  } else {
    conditions.push(isNull(messages.branchId));
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

export async function getRecentMessages(
  conversationId: string,
  branchId?: string | null,
  limit = 40,
): Promise<Message[]> {
  const conditions = [eq(messages.conversationId, conversationId)];

  if (branchId) {
    conditions.push(eq(messages.branchId, branchId));
  } else {
    conditions.push(isNull(messages.branchId));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.map(rowToMessage).reverse();
}

export async function getMessagesBefore(
  conversationId: string,
  branchId: string | null | undefined,
  before: string,
  limit = 40,
): Promise<Message[]> {
  const conditions = [eq(messages.conversationId, conversationId), lt(messages.createdAt, before)];

  if (branchId) {
    conditions.push(eq(messages.branchId, branchId));
  } else {
    conditions.push(isNull(messages.branchId));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.map(rowToMessage).reverse();
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

export async function clearMessages(conversationId: string): Promise<void> {
  await db.delete(messages).where(eq(messages.conversationId, conversationId));
}

export async function insertMessages(msgs: Message[]): Promise<void> {
  if (msgs.length === 0) return;
  await db.insert(messages).values(
    msgs.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      role: msg.role,
      senderModelId: msg.senderModelId,
      senderName: msg.senderName,
      identityId: msg.identityId,
      content: msg.content,
      images: JSON.stringify(msg.images ?? []),
      generatedImages: JSON.stringify(msg.generatedImages ?? []),
      reasoningContent: msg.reasoningContent,
      reasoningDuration: msg.reasoningDuration,
      toolCalls: JSON.stringify(msg.toolCalls),
      toolResults: JSON.stringify(msg.toolResults),
      branchId: msg.branchId,
      parentMessageId: msg.parentMessageId,
      isStreaming: msg.isStreaming ? 1 : 0,
      createdAt: msg.createdAt,
    })),
  );
}

// ─── Message Blocks ───

export function rowToBlock(row: typeof messageBlocks.$inferSelect): MessageBlock {
  return {
    id: row.id,
    messageId: row.messageId,
    type: row.type as MessageBlockType,
    content: row.content || "",
    status: row.status as MessageBlockStatus,
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function insertBlock(block: MessageBlock): Promise<void> {
  await db.insert(messageBlocks).values({
    id: block.id,
    messageId: block.messageId,
    type: block.type,
    content: block.content,
    status: block.status,
    metadata: block.metadata ? JSON.stringify(block.metadata) : null,
    sortOrder: block.sortOrder,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  });
}

export async function updateBlock(id: string, updates: Partial<MessageBlock>): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (updates.content !== undefined) values.content = updates.content;
  if (updates.status !== undefined) values.status = updates.status;
  if (updates.type !== undefined) values.type = updates.type;
  if (updates.metadata !== undefined) values.metadata = updates.metadata ? JSON.stringify(updates.metadata) : null;
  if (updates.sortOrder !== undefined) values.sortOrder = updates.sortOrder;

  if (Object.keys(values).length > 1) {
    await db.update(messageBlocks).set(values).where(eq(messageBlocks.id, id));
  }
}

export async function getBlocksByMessageId(messageId: string): Promise<MessageBlock[]> {
  const rows = await db
    .select()
    .from(messageBlocks)
    .where(eq(messageBlocks.messageId, messageId))
    .orderBy(asc(messageBlocks.sortOrder));
  return rows.map(rowToBlock);
}

export async function deleteBlocksByMessageId(messageId: string): Promise<void> {
  await db.delete(messageBlocks).where(eq(messageBlocks.messageId, messageId));
}

// Re-export for backward compat
export {
  updateMessage as dbUpdateMessage,
  deleteConversation as dbDeleteConversation,
  updateConversation as dbUpdateConversation,
  getMessages as dbGetMessages,
  getRecentMessages as dbGetRecentMessages,
  getMessagesBefore as dbGetMessagesBefore,
  searchMessages as dbSearchMessages,
  deleteMessage as dbDeleteMessage,
  clearMessages as dbClearMessages,
  insertMessages as dbInsertMessages,
};
