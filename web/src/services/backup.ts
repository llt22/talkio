/**
 * Backup & Restore service.
 * Exports conversations + messages as JSON, imports them back.
 * Uses File System Access API (desktop) or download trick (mobile).
 */
import { kvStore } from "../storage/kv-store";
import { getAllConversations, getAllMessagesForConversation, insertConversation, insertMessage, getConversation } from "../storage/database";
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
    const msgs = await getAllMessagesForConversation(conv.id);
    allMessages.push(...msgs);
  }
  return {
    ...config,
    scope: "full",
    conversations,
    messages: allMessages,
  };
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
