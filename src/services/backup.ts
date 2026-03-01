/**
 * Config Backup & Restore service.
 * Exports/imports providers, models, identities, and MCP servers as JSON.
 */
import { kvStore } from "../storage/kv-store";
import { saveOrShareFile } from "./file-download";
import type { Provider, Model, Identity, McpServer } from "../types";
import type { AppSettings } from "../stores/settings-store";

export interface BackupData {
  version: "2.0";
  exportedAt: string;
  providers: Provider[];
  models: Model[];
  identities: Identity[];
  mcpServers: McpServer[];
  settings?: AppSettings | null;
}

export function createBackup(): BackupData {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    providers: kvStore.getObject("providers") ?? [],
    models: kvStore.getObject("models") ?? [],
    identities: kvStore.getObject("identities") ?? [],
    mcpServers: kvStore.getObject("mcp_servers") ?? [],
    settings: kvStore.getObject("settings") ?? null,
  };
}

export async function downloadBackup(data: BackupData): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);
  const defaultName = `talkio-config-${new Date().toISOString().slice(0, 10)}.json`;
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
  };
}

export function importBackupFromString(text: string): ImportResult {
  try {
    const data = JSON.parse(text) as BackupData;

    if (data.version !== "2.0") {
      return { success: false, errorCode: "UNSUPPORTED_VERSION", errorDetail: data.version };
    }

    if (data.providers) kvStore.setObject("providers", data.providers);
    if (data.models) kvStore.setObject("models", data.models);
    if (data.identities) kvStore.setObject("identities", data.identities);
    if (data.mcpServers) kvStore.setObject("mcp_servers", data.mcpServers);
    if (data.settings) kvStore.setObject("settings", data.settings);

    return {
      success: true,
      counts: {
        providers: data.providers?.length ?? 0,
        models: data.models?.length ?? 0,
        identities: data.identities?.length ?? 0,
        mcpServers: data.mcpServers?.length ?? 0,
        settings: !!data.settings,
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

export async function importBackup(file: File): Promise<ImportResult> {
  const text = await file.text();
  return importBackupFromString(text);
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
      return importBackupFromString(text);
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
