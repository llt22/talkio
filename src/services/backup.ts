/**
 * Versioned full-data backup and restore service.
 */
import { kvStore } from "../storage/kv-store";
import { secretStore } from "./secret-store";
import { saveOrShareFile } from "./file-download";
import type { Provider, Model, Identity, McpServer, Task } from "../types";
import type { Conversation, Message, MessageBlock } from "../types";
import type { AppSettings } from "../stores/settings-store";
import {
  getAllBlocks,
  getAllConversations,
  getAllMessages,
  getAllTasks,
  replaceChatData,
} from "../storage/database";

type BackupProvider = Omit<Provider, "apiKey"> & { apiKey?: string };
type BackupSettings = Omit<AppSettings, "sttApiKey" | "imageApiKey" | "webdavPassword"> & {
  sttApiKey?: string;
  imageApiKey?: string;
  webdavPassword?: string;
};

export interface LegacyBackupData {
  version: "2.0";
  exportedAt: string;
  providers: BackupProvider[];
  models: Model[];
  identities: Identity[];
  mcpServers: McpServer[];
  settings?: BackupSettings | null;
}

export interface BackupData extends Omit<LegacyBackupData, "version"> {
  version: "3.0";
  conversations: Conversation[];
  messages: Message[];
  messageBlocks: MessageBlock[];
  tasks: Task[];
}

export async function createBackup(includeSecrets = false): Promise<BackupData> {
  const [conversations, messages, messageBlocks, tasks] = await Promise.all([
    getAllConversations(),
    getAllMessages(),
    getAllBlocks(),
    getAllTasks(),
  ]);
  const rawProviders = kvStore.getObject<Provider[]>("providers") ?? [];
  const providers: BackupProvider[] = includeSecrets
    ? await Promise.all(
        rawProviders.map(async ({ apiKey: _apiKey, ...provider }) => {
          const key = await secretStore.get(provider.id);
          return key ? { ...provider, apiKey: key } : provider;
        }),
      )
    : rawProviders.map(({ apiKey: _apiKey, ...provider }) => provider);
  const storedSettings = kvStore.getObject<AppSettings>("settings");
  const settings: BackupSettings | null = storedSettings
    ? includeSecrets
      ? storedSettings
      : (({
          sttApiKey: _sttApiKey,
          imageApiKey: _imageApiKey,
          webdavPassword: _webdavPassword,
          ...value
        }) => value)(storedSettings)
    : null;
  return {
    version: "3.0",
    exportedAt: new Date().toISOString(),
    providers,
    models: kvStore.getObject("models") ?? [],
    identities: kvStore.getObject("identities") ?? [],
    mcpServers: kvStore.getObject("mcp_servers") ?? [],
    settings,
    conversations,
    messages,
    messageBlocks,
    tasks,
  };
}

export async function downloadBackup(data: BackupData): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);
  const defaultName = `talkio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return saveOrShareFile(defaultName, json, {
    mimeType: "application/json",
    filterName: "JSON",
    filterExtensions: ["json"],
  });
}

export interface ImportResult {
  success: boolean;
  errorCode?: "UNSUPPORTED_VERSION" | "PARSE_ERROR";
  errorDetail?: string;
  counts?: {
    providers: number;
    models: number;
    identities: number;
    mcpServers: number;
    settings: boolean;
    conversations: number;
    messages: number;
    messageBlocks: number;
    tasks: number;
  };
}

export async function importBackupFromString(text: string): Promise<ImportResult> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error("Backup root must be an object");

    if (parsed.version !== "2.0" && parsed.version !== "3.0") {
      return {
        success: false,
        errorCode: "UNSUPPORTED_VERSION",
        errorDetail: typeof parsed.version === "string" ? parsed.version : undefined,
      };
    }

    const data = validateBackupData(parsed);

    const configSnapshot = captureConfigSnapshot();
    try {
      await applyConfigData(data);
      if (data.version === "3.0") {
        await replaceChatData({
          conversations: data.conversations,
          messages: data.messages,
          messageBlocks: data.messageBlocks,
          tasks: data.tasks ?? [],
        });
      }
    } catch (error) {
      restoreConfigSnapshot(configSnapshot);
      throw error;
    }

    return {
      success: true,
      counts: {
        providers: data.providers?.length ?? 0,
        models: data.models?.length ?? 0,
        identities: data.identities?.length ?? 0,
        mcpServers: data.mcpServers?.length ?? 0,
        settings: !!data.settings,
        conversations: data.version === "3.0" ? data.conversations.length : 0,
        messages: data.version === "3.0" ? data.messages.length : 0,
        messageBlocks: data.version === "3.0" ? data.messageBlocks.length : 0,
        tasks: data.version === "3.0" ? (data.tasks ?? []).length : 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      errorCode: "PARSE_ERROR",
      errorDetail: err instanceof Error ? err.message : undefined,
    };
  }
}

function validateBackupData(data: Record<string, unknown>): BackupData | LegacyBackupData {
  requireRecordsWithStringFields(data, "providers", ["id"]);
  requireRecordsWithStringFields(data, "models", ["id", "providerId"]);
  requireRecordsWithStringFields(data, "identities", ["id"]);
  requireRecordsWithStringFields(data, "mcpServers", ["id"]);
  if (data.settings !== undefined && data.settings !== null && !isRecord(data.settings)) {
    throw new Error("Backup field settings must be an object or null");
  }

  if (data.version === "3.0") {
    const conversations = requireRecordsWithStringFields(data, "conversations", [
      "id",
      "type",
      "title",
      "createdAt",
      "updatedAt",
    ]);
    conversations.forEach((conversation, index) => {
      if (!Array.isArray(conversation.participants) || typeof conversation.pinned !== "boolean") {
        throw new Error(`Backup conversation at index ${index} has invalid fields`);
      }
    });

    const messages = requireRecordsWithStringFields(data, "messages", [
      "id",
      "conversationId",
      "role",
      "content",
      "status",
      "createdAt",
    ]);
    messages.forEach((message, index) => {
      const arrayFields = ["images", "generatedImages", "toolCalls", "toolResults"];
      if (
        arrayFields.some((field) => !Array.isArray(message[field])) ||
        typeof message.isStreaming !== "boolean"
      ) {
        throw new Error(`Backup message at index ${index} has invalid fields`);
      }
    });

    const blocks = requireRecordsWithStringFields(data, "messageBlocks", [
      "id",
      "messageId",
      "type",
      "content",
      "status",
      "createdAt",
    ]);
    blocks.forEach((block, index) => {
      if (typeof block.sortOrder !== "number") {
        throw new Error(`Backup message block at index ${index} has invalid fields`);
      }
    });

    // Optional for v3.0 backups exported before the tasks table existed.
    if (data.tasks !== undefined) {
      requireRecordsWithStringFields(data, "tasks", [
        "id",
        "conversationId",
        "title",
        "status",
        "createdAt",
        "updatedAt",
      ]);
    }
  }

  return data as unknown as BackupData | LegacyBackupData;
}

function requireRecordsWithStringFields(
  data: Record<string, unknown>,
  field: string,
  stringFields: string[],
): Record<string, unknown>[] {
  const value = data[field];
  if (!Array.isArray(value)) throw new Error(`Backup field ${field} must be an array`);
  return value.map((item, index) => {
    if (!isRecord(item) || stringFields.some((key) => typeof item[key] !== "string")) {
      throw new Error(`Backup field ${field} has an invalid item at index ${index}`);
    }
    return item;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CONFIG_KEYS = ["providers", "models", "identities", "mcp_servers", "settings"] as const;

function captureConfigSnapshot(): Map<(typeof CONFIG_KEYS)[number], string | null> {
  return new Map(CONFIG_KEYS.map((key) => [key, kvStore.getString(key)]));
}

function restoreConfigSnapshot(snapshot: Map<(typeof CONFIG_KEYS)[number], string | null>): void {
  for (const [key, value] of snapshot) {
    if (value === null) kvStore.delete(key);
    else kvStore.set(key, value);
  }
}

async function applyConfigData(data: BackupData | LegacyBackupData): Promise<void> {
  if (data.providers) {
    // Restore any secrets the backup carried; backups without keys simply skip this.
    for (const provider of data.providers) {
      if (provider.apiKey) await secretStore.set(provider.id, provider.apiKey);
    }
    kvStore.setObject(
      "providers",
      data.providers.map(({ apiKey: _apiKey, ...provider }) => provider),
    );
  }
  if (data.models) kvStore.setObject("models", data.models);
  if (data.identities) kvStore.setObject("identities", data.identities);
  if (data.mcpServers) kvStore.setObject("mcp_servers", data.mcpServers);
  if (data.settings) {
    const { sttApiKey, imageApiKey, webdavPassword, ...rest } = data.settings;
    const settings: Record<string, unknown> = { ...rest };
    if (sttApiKey) settings.sttApiKey = sttApiKey;
    if (imageApiKey) settings.imageApiKey = imageApiKey;
    if (webdavPassword) settings.webdavPassword = webdavPassword;
    kvStore.setObject("settings", settings);
  }
}

export async function importBackup(file: File): Promise<ImportResult> {
  const text = await file.text();
  return await importBackupFromString(text);
}

export async function pickAndImportBackup(): Promise<ImportResult | null> {
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return null;
      const text = await readTextFile(filePath as string);
      return await importBackupFromString(text);
    } catch {
      // Fallback to browser file picker
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(await importBackup(file));
    };
    input.click();
  });
}
