/**
 * Backup & Restore service.
 * Exports conversations + messages as JSON, imports them back.
 * Uses File System Access API (desktop) or download trick (mobile).
 */
import { kvStore } from "../storage/kv-store";
import { getAllConversations, getMessages, insertConversation, insertMessage, getConversation } from "../storage/database";
import type { Conversation, Message } from "../../../src/types";

export interface BackupData {
  version: "2.0";
  scope: "config" | "full";
  exportedAt: string;
  providers: any[];
  models: any[];
  identities: any[];
  mcpServers: any[];
  conversations?: Conversation[];
  messages?: Message[];
}

export function createBackup(): BackupData {
  return {
    version: "2.0",
    scope: "config",
    exportedAt: new Date().toISOString(),
    providers: kvStore.getObject("providers") ?? [],
    models: kvStore.getObject("models") ?? [],
    identities: kvStore.getObject("identities") ?? [],
    mcpServers: kvStore.getObject("mcp_servers") ?? [],
  };
}

export async function createFullBackup(): Promise<BackupData> {
  const config = createBackup();
  const conversations = await getAllConversations();
  const allMessages: Message[] = [];
  for (const conv of conversations) {
    const msgs = await getMessages(conv.id, null, 10000);
    allMessages.push(...msgs);
    // Also get branch messages (branchId != null)
    const branchMsgs = await getBranchMessages(conv.id);
    allMessages.push(...branchMsgs);
  }
  return {
    ...config,
    scope: "full",
    conversations,
    messages: allMessages,
  };
}

async function getBranchMessages(conversationId: string): Promise<Message[]> {
  try {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:talkio.db");
    const rows: any[] = await db.select(
      `SELECT * FROM messages WHERE conversationId = $1 AND branchId IS NOT NULL ORDER BY createdAt ASC`,
      [conversationId]
    );
    return rows.map((row: any) => ({
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
      status: row.status || "success",
      errorMessage: row.errorMessage ?? null,
      tokenUsage: safeJsonParse(row.tokenUsage, null),
      createdAt: row.createdAt,
    }));
  } catch {
    return [];
  }
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function downloadBackup(data: BackupData) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = data.scope === "full" ? "full" : "config";
  a.download = `talkio-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<{ success: boolean; message: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as BackupData;

    if (data.version !== "2.0") {
      return { success: false, message: `Unsupported backup version: ${data.version}` };
    }

    // Import config
    if (data.providers) kvStore.setObject("providers", data.providers);
    if (data.models) kvStore.setObject("models", data.models);
    if (data.identities) kvStore.setObject("identities", data.identities);
    if (data.mcpServers) kvStore.setObject("mcp_servers", data.mcpServers);

    let convCount = 0;
    let msgCount = 0;

    // Import conversations + messages if present (full backup)
    if (data.conversations && data.conversations.length > 0) {
      for (const conv of data.conversations) {
        const existing = await getConversation(conv.id);
        if (!existing) {
          await insertConversation(conv);
          convCount++;
        }
      }
    }
    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages) {
        try {
          await insertMessage(msg);
          msgCount++;
        } catch {
          // Skip duplicates (already exists)
        }
      }
    }

    const parts = [`${data.providers?.length ?? 0} providers`, `${data.models?.length ?? 0} models`, `${data.identities?.length ?? 0} identities`];
    if (convCount > 0) parts.push(`${convCount} conversations`);
    if (msgCount > 0) parts.push(`${msgCount} messages`);
    return { success: true, message: `Imported ${parts.join(", ")}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed to parse backup file" };
  }
}
