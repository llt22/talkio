/**
 * Tauri SQLite database layer — replaces drizzle-orm/expo-sqlite.
 * Uses @tauri-apps/plugin-sql for SQLite access.
 * API matches the RN version's database.ts exports.
 */
import type { Message, Conversation, MessageBlock } from "../types";
import { MessageStatus, MessageBlockType, MessageBlockStatus } from "../types";

// Dynamic import to avoid SSR issues and allow fallback
let _db: any = null;

async function getDb() {
  if (_db) return _db;
  try {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    _db = await Database.load("sqlite:talkio.db");
  } catch {
    // Fallback: in-memory store for dev/browser preview
    console.warn("[DB] Tauri SQL plugin not available, using in-memory fallback");
    _db = createInMemoryDb();
  }
  return _db;
}

// ─── In-Memory Fallback (for browser dev) ───
function createInMemoryDb() {
  const tables: Record<string, Map<string, Record<string, any>>> = {
    conversations: new Map(),
    messages: new Map(),
    message_blocks: new Map(),
  };

  function parseWhere(sql: string, params: any[]): { table: string; conditions: [string, any][] } {
    const tableMatch = sql.match(/FROM\s+(\w+)/i) || sql.match(/(?:INTO|UPDATE|DELETE FROM)\s+(\w+)/i);
    const table = tableMatch?.[1] ?? "";
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/is);
    const conditions: [string, any][] = [];
    if (whereMatch) {
      const parts = whereMatch[1].split(/\s+AND\s+/i);
      let pIdx = 0;
      // Count $N placeholders before WHERE to find offset
      const beforeWhere = sql.slice(0, sql.search(/WHERE/i));
      pIdx = (beforeWhere.match(/\$\d+/g) ?? []).length;
      for (const part of parts) {
        const m = part.match(/(\w+)\s*(?:=|IS)\s*\$\d+/i);
        if (m) conditions.push([m[1], params[pIdx]]);
        else {
          const isNull = part.match(/(\w+)\s+IS\s+NULL/i);
          if (isNull) conditions.push([isNull[1], null]);
        }
        pIdx++;
      }
    }
    return { table, conditions };
  }

  function matchRow(row: Record<string, any>, conditions: [string, any][]): boolean {
    return conditions.every(([col, val]) => {
      if (val === null || val === undefined) return row[col] === null || row[col] === undefined;
      return String(row[col]) === String(val);
    });
  }

  return {
    execute: async (sql: string, params: any[] = []) => {
      const s = sql.trim().toUpperCase();

      if (s.startsWith("CREATE") || s.startsWith("DROP") || s.startsWith("PRAGMA")) {
        return { rowsAffected: 0 };
      }

      if (s.startsWith("INSERT INTO")) {
        const tblMatch = sql.match(/INSERT INTO (\w+)/i);
        const tbl = tblMatch?.[1];
        if (!tbl || !tables[tbl]) return { rowsAffected: 0 };
        const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        const cols = colMatch?.[1].split(",").map((c) => c.trim()) ?? [];
        const row: Record<string, any> = {};
        cols.forEach((c, i) => { row[c] = params[i] ?? null; });
        const id = row.id ?? String(Date.now() + Math.random());
        row.id = id;
        tables[tbl].set(id, row);
        return { rowsAffected: 1 };
      }

      if (s.startsWith("UPDATE")) {
        const tblMatch = sql.match(/UPDATE (\w+)/i);
        const tbl = tblMatch?.[1];
        if (!tbl || !tables[tbl]) return { rowsAffected: 0 };
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/is);
        const setStr = setMatch?.[1] ?? "";
        const { conditions } = parseWhere(sql, params);
        // Parse each "col = $N" directly using regex to avoid comma-in-JSON bugs
        const setOps: [string, number][] = [];
        const setRe = /(\w+)\s*=\s*\$(\d+)/gi;
        let sm: RegExpExecArray | null;
        while ((sm = setRe.exec(setStr)) !== null) {
          setOps.push([sm[1], Number(sm[2]) - 1]); // $N is 1-indexed
        }
        let count = 0;
        tables[tbl].forEach((row, key) => {
          if (matchRow(row, conditions)) {
            const updated = { ...row };
            setOps.forEach(([col, idx]) => { updated[col] = params[idx]; });
            tables[tbl].set(key, updated);
            count++;
          }
        });
        return { rowsAffected: count };
      }

      if (s.startsWith("DELETE FROM")) {
        const tblMatch = sql.match(/DELETE FROM (\w+)/i);
        const tbl = tblMatch?.[1];
        if (!tbl || !tables[tbl]) return { rowsAffected: 0 };
        const { conditions } = parseWhere(sql, params);
        if (conditions.length === 0) {
          const c = tables[tbl].size;
          tables[tbl].clear();
          return { rowsAffected: c };
        }
        let count = 0;
        tables[tbl].forEach((row, key) => {
          if (matchRow(row, conditions)) { tables[tbl].delete(key); count++; }
        });
        return { rowsAffected: count };
      }

      return { rowsAffected: 0 };
    },

    select: async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
      const { table, conditions } = parseWhere(sql, params);
      const tbl = tables[table];
      if (!tbl) return [] as T[];

      let rows = Array.from(tbl.values()).filter((r) => matchRow(r, conditions));

      const orderMatch = sql.match(/ORDER BY\s+(.+?)(?:\s+LIMIT|\s*$)/i);
      if (orderMatch) {
        const orderCols = orderMatch[1].split(",").map((part) => {
          const m = part.trim().match(/(\w+)\s*(ASC|DESC)?/i);
          return m ? { col: m[1], desc: (m[2] ?? "ASC").toUpperCase() === "DESC" } : null;
        }).filter(Boolean) as { col: string; desc: boolean }[];
        rows.sort((a, b) => {
          for (const { col, desc } of orderCols) {
            const av = a[col] ?? "";
            const bv = b[col] ?? "";
            if (av < bv) return desc ? 1 : -1;
            if (av > bv) return desc ? -1 : 1;
          }
          return 0;
        });
      }

      const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) rows = rows.slice(0, Number(limitMatch[1]));

      return rows as T[];
    },
  };
}

// ─── JSON Helpers ───
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T; // already parsed object
  if (!value) return fallback;
  if (value === "[]") return [] as unknown as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function rowToConversation(row: any): Conversation {
  return {
    id: row.id,
    type: row.type || "single",
    title: row.title || "",
    participants: safeJsonParse(row.participants, []),
    speakingOrder: row.speakingOrder ?? undefined,
    lastMessage: row.lastMessage ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
    pinned: row.pinned === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    senderModelId: row.senderModelId ?? null,
    senderName: row.senderName ?? null,
    identityId: row.identityId ?? null,
    participantId: row.participantId ?? null,
    content: row.content || "",
    images: safeJsonParse(row.images, []),
    generatedImages: safeJsonParse(row.generatedImages, []),
    reasoningContent: row.reasoningContent ?? null,
    reasoningDuration: row.reasoningDuration ?? null,
    toolCalls: safeJsonParse(row.toolCalls, []),
    toolResults: safeJsonParse(row.toolResults, []),
    branchId: row.branchId ?? null,
    parentMessageId: row.parentMessageId ?? null,
    isStreaming: row.isStreaming === 1,
    status: (row.status as MessageStatus) || MessageStatus.SUCCESS,
    errorMessage: row.errorMessage ?? null,
    tokenUsage: safeJsonParse(row.tokenUsage, null),
    createdAt: row.createdAt,
  };
}

function rowToBlock(row: any): MessageBlock {
  return {
    id: row.id,
    messageId: row.messageId,
    type: row.type as MessageBlockType,
    content: row.content || "",
    status: row.status as MessageBlockStatus,
    metadata: safeJsonParse(row.metadata, null),
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

// ─── Init ───
export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'single',
      title TEXT NOT NULL DEFAULT '',
      participants TEXT NOT NULL DEFAULT '[]',
      speakingOrder TEXT,
      lastMessage TEXT,
      lastMessageAt TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  // Migration: add speakingOrder column for databases created before this field existed
  try { await db.execute(`ALTER TABLE conversations ADD COLUMN speakingOrder TEXT`); } catch { /* column already exists */ }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL,
      senderModelId TEXT,
      senderName TEXT,
      identityId TEXT,
      participantId TEXT,
      content TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      generatedImages TEXT NOT NULL DEFAULT '[]',
      reasoningContent TEXT,
      reasoningDuration REAL,
      toolCalls TEXT NOT NULL DEFAULT '[]',
      toolResults TEXT NOT NULL DEFAULT '[]',
      branchId TEXT,
      parentMessageId TEXT,
      isStreaming INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      errorMessage TEXT,
      tokenUsage TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(branchId)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_conv_branch_created ON messages(conversationId, branchId, createdAt)`);
  await db.execute(`
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
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_blocks_message ON message_blocks(messageId)`);
}

// ─── Conversations ───
export async function insertConversation(conv: Conversation): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO conversations (id, type, title, participants, speakingOrder, lastMessage, lastMessageAt, pinned, createdAt, updatedAt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [conv.id, conv.type, conv.title, JSON.stringify(conv.participants),
     conv.speakingOrder ?? null, conv.lastMessage, conv.lastMessageAt, conv.pinned ? 1 : 0,
     conv.createdAt, conv.updatedAt]
  );
}

export async function updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
  const db = await getDb();
  const sets: string[] = ["updatedAt = $1"];
  const params: any[] = [new Date().toISOString()];
  let idx = 2;

  if (updates.type !== undefined) { sets.push(`type = $${idx}`); params.push(updates.type); idx++; }
  if (updates.title !== undefined) { sets.push(`title = $${idx}`); params.push(updates.title); idx++; }
  if (updates.participants !== undefined) { sets.push(`participants = $${idx}`); params.push(JSON.stringify(updates.participants)); idx++; }
  if (updates.lastMessage !== undefined) { sets.push(`lastMessage = $${idx}`); params.push(updates.lastMessage); idx++; }
  if (updates.lastMessageAt !== undefined) { sets.push(`lastMessageAt = $${idx}`); params.push(updates.lastMessageAt); idx++; }
  if (updates.pinned !== undefined) { sets.push(`pinned = $${idx}`); params.push(updates.pinned ? 1 : 0); idx++; }
  if (updates.speakingOrder !== undefined) { sets.push(`speakingOrder = $${idx}`); params.push(updates.speakingOrder); idx++; }

  params.push(id);
  await db.execute(`UPDATE conversations SET ${sets.join(", ")} WHERE id = $${idx}`, params);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM messages WHERE conversationId = $1`, [id]);
  await db.execute(`DELETE FROM conversations WHERE id = $1`, [id]);
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db.select(`SELECT * FROM conversations ORDER BY pinned DESC, updatedAt DESC`);
  return rows.map(rowToConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await getDb();
  const rows = await db.select(`SELECT * FROM conversations WHERE id = $1 LIMIT 1`, [id]);
  return rows.length > 0 ? rowToConversation(rows[0]) : null;
}

// ─── Messages ───
export async function insertMessage(msg: Message): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO messages (id, conversationId, role, senderModelId, senderName, identityId, participantId,
     content, images, generatedImages, reasoningContent, reasoningDuration,
     toolCalls, toolResults, branchId, parentMessageId, isStreaming, status, errorMessage, tokenUsage, createdAt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [msg.id, msg.conversationId, msg.role, msg.senderModelId, msg.senderName,
     msg.identityId, msg.participantId, msg.content,
     JSON.stringify(msg.images ?? []), JSON.stringify(msg.generatedImages ?? []),
     msg.reasoningContent, msg.reasoningDuration,
     JSON.stringify(msg.toolCalls), JSON.stringify(msg.toolResults),
     msg.branchId, msg.parentMessageId, msg.isStreaming ? 1 : 0,
     msg.status ?? MessageStatus.SUCCESS, msg.errorMessage ?? null,
     msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null, msg.createdAt]
  );
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (updates.content !== undefined) { sets.push(`content = $${idx}`); params.push(updates.content); idx++; }
  if (updates.images !== undefined) { sets.push(`images = $${idx}`); params.push(JSON.stringify(updates.images)); idx++; }
  if (updates.generatedImages !== undefined) { sets.push(`generatedImages = $${idx}`); params.push(JSON.stringify(updates.generatedImages)); idx++; }
  if (updates.reasoningContent !== undefined) { sets.push(`reasoningContent = $${idx}`); params.push(updates.reasoningContent); idx++; }
  if (updates.reasoningDuration !== undefined) { sets.push(`reasoningDuration = $${idx}`); params.push(updates.reasoningDuration); idx++; }
  if (updates.toolCalls !== undefined) { sets.push(`toolCalls = $${idx}`); params.push(JSON.stringify(updates.toolCalls)); idx++; }
  if (updates.toolResults !== undefined) { sets.push(`toolResults = $${idx}`); params.push(JSON.stringify(updates.toolResults)); idx++; }
  if (updates.isStreaming !== undefined) { sets.push(`isStreaming = $${idx}`); params.push(updates.isStreaming ? 1 : 0); idx++; }
  if (updates.status !== undefined) { sets.push(`status = $${idx}`); params.push(updates.status); idx++; }
  if (updates.errorMessage !== undefined) { sets.push(`errorMessage = $${idx}`); params.push(updates.errorMessage); idx++; }
  if (updates.tokenUsage !== undefined) { sets.push(`tokenUsage = $${idx}`); params.push(updates.tokenUsage ? JSON.stringify(updates.tokenUsage) : null); idx++; }
  if (updates.participantId !== undefined) { sets.push(`participantId = $${idx}`); params.push(updates.participantId); idx++; }

  if (sets.length === 0) return;
  params.push(id);
  await db.execute(`UPDATE messages SET ${sets.join(", ")} WHERE id = $${idx}`, params);
}

export async function getMessages(conversationId: string, branchId?: string | null, limit = 100, offset = 0): Promise<Message[]> {
  const db = await getDb();
  let rows: any[];
  if (branchId) {
    rows = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId = $2 ORDER BY createdAt ASC LIMIT $3 OFFSET $4`,
      [conversationId, branchId, limit, offset]
    );
  } else {
    rows = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId IS NULL ORDER BY createdAt ASC LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
  }
  return rows.map(rowToMessage);
}

export async function getRecentMessages(conversationId: string, branchId?: string | null, limit = 40): Promise<Message[]> {
  const db = await getDb();
  let rows: any[];
  if (branchId) {
    rows = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId = $2 ORDER BY createdAt DESC LIMIT $3`,
      [conversationId, branchId, limit]
    );
  } else {
    rows = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId IS NULL ORDER BY createdAt DESC LIMIT $2`,
      [conversationId, limit]
    );
  }
  return rows.map(rowToMessage).reverse();
}

export async function getMessagesBefore(conversationId: string, branchId: string | null | undefined, before: string, limit = 40): Promise<Message[]> {
  const db = await getDb();
  let rows: any[];
  if (branchId) {
    rows = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId = $2 AND createdAt < $3 ORDER BY createdAt DESC LIMIT $4`,
      [conversationId, branchId, before, limit]
    );
  } else {
    rows = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId IS NULL AND createdAt < $2 ORDER BY createdAt DESC LIMIT $3`,
      [conversationId, before, limit]
    );
  }
  return rows.map(rowToMessage).reverse();
}

export async function searchMessages(query: string): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select(
    `SELECT * FROM messages WHERE content LIKE $1 ORDER BY createdAt DESC LIMIT 50`,
    [`%${query}%`]
  );
  return rows.map(rowToMessage);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM message_blocks WHERE messageId = $1`, [id]);
  await db.execute(`DELETE FROM messages WHERE id = $1`, [id]);
}

export async function getAllMessagesForConversation(conversationId: string): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select(
    `SELECT * FROM messages WHERE conversationId = $1 ORDER BY createdAt ASC`,
    [conversationId]
  );
  return rows.map(rowToMessage);
}

export async function clearMessages(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM messages WHERE conversationId = $1`, [conversationId]);
}

export async function insertMessages(msgs: Message[]): Promise<void> {
  if (msgs.length === 0) return;
  const db = await getDb();
  try { await db.execute("BEGIN TRANSACTION"); } catch { /* in-memory fallback doesn't support transactions */ }
  try {
    for (const msg of msgs) {
      await insertMessage(msg);
    }
    try { await db.execute("COMMIT"); } catch {}
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch {}
    throw err;
  }
}

// ─── Message Blocks ───
export async function insertBlock(block: MessageBlock): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO message_blocks (id, messageId, type, content, status, metadata, sortOrder, createdAt, updatedAt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [block.id, block.messageId, block.type, block.content, block.status,
     block.metadata ? JSON.stringify(block.metadata) : null,
     block.sortOrder, block.createdAt, block.updatedAt]
  );
}

export async function updateBlock(id: string, updates: Partial<MessageBlock>): Promise<void> {
  const db = await getDb();
  const sets: string[] = [`updatedAt = $1`];
  const params: any[] = [new Date().toISOString()];
  let idx = 2;

  if (updates.content !== undefined) { sets.push(`content = $${idx}`); params.push(updates.content); idx++; }
  if (updates.status !== undefined) { sets.push(`status = $${idx}`); params.push(updates.status); idx++; }
  if (updates.type !== undefined) { sets.push(`type = $${idx}`); params.push(updates.type); idx++; }
  if (updates.metadata !== undefined) { sets.push(`metadata = $${idx}`); params.push(updates.metadata ? JSON.stringify(updates.metadata) : null); idx++; }
  if (updates.sortOrder !== undefined) { sets.push(`sortOrder = $${idx}`); params.push(updates.sortOrder); idx++; }

  if (sets.length <= 1) return;
  params.push(id);
  await db.execute(`UPDATE message_blocks SET ${sets.join(", ")} WHERE id = $${idx}`, params);
}

export async function getBlocksByMessageId(messageId: string): Promise<MessageBlock[]> {
  const db = await getDb();
  const rows = await db.select(
    `SELECT * FROM message_blocks WHERE messageId = $1 ORDER BY sortOrder ASC`, [messageId]
  );
  return rows.map(rowToBlock);
}

export async function deleteBlocksByMessageId(messageId: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM message_blocks WHERE messageId = $1`, [messageId]);
}

// Re-exports for compatibility
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
