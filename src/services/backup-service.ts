import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { db, expoDb } from "../../db";
import { conversations, messages } from "../../db/schema";
import { logger } from "./logger";

const log = logger.withContext("BackupService");

export interface BackupData {
  version: number;
  createdAt: string;
  conversations: any[];
  messages: any[];
}

export async function createBackup(): Promise<string> {
  log.info("Creating backup...");

  const allConversations = await db.select().from(conversations);
  const allMessages = await db.select().from(messages);

  const backup: BackupData = {
    version: 1,
    createdAt: new Date().toISOString(),
    conversations: allConversations,
    messages: allMessages,
  };

  const fileName = `avatar-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("Cache directory not available");
  const fileUri = `${cacheDir}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

  log.info(`Backup created: ${fileName} (${allConversations.length} conversations, ${allMessages.length} messages)`);
  return fileUri;
}

export async function shareBackup(): Promise<void> {
  const uri = await createBackup();
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle: "Export Avatar Backup",
    });
  } else {
    throw new Error("Sharing is not available on this platform");
  }
}

export async function restoreBackup(jsonContent: string): Promise<{ conversations: number; messages: number }> {
  log.info("Restoring backup...");

  let backup: BackupData;
  try {
    backup = JSON.parse(jsonContent);
  } catch {
    throw new Error("Invalid backup file format");
  }

  if (!backup.version || !backup.conversations || !backup.messages) {
    throw new Error("Invalid backup structure");
  }

  // Wrap in transaction: if any insert fails, roll back to preserve original data
  try {
    expoDb.execSync("BEGIN TRANSACTION");

    expoDb.execSync("DELETE FROM messages");
    expoDb.execSync("DELETE FROM conversations");

    for (const conv of backup.conversations) {
      await db.insert(conversations).values(conv);
    }

    for (const msg of backup.messages) {
      await db.insert(messages).values(msg);
    }

    expoDb.execSync("COMMIT");
  } catch (err) {
    expoDb.execSync("ROLLBACK");
    log.error(`Backup restore failed, rolled back: ${err instanceof Error ? err.message : "Unknown"}`);
    throw new Error("Restore failed — original data has been preserved.");
  }

  log.info(`Backup restored: ${backup.conversations.length} conversations, ${backup.messages.length} messages`);

  return {
    conversations: backup.conversations.length,
    messages: backup.messages.length,
  };
}
