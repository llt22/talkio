/**
 * Config Backup & Restore service.
 * Exports/imports providers, models, identities, and MCP servers as JSON.
 */
import { kvStore } from "../storage/kv-store";

export interface BackupData {
  version: "2.0";
  exportedAt: string;
  providers: any[];
  models: any[];
  identities: any[];
  mcpServers: any[];
}

export function createBackup(): BackupData {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    providers: kvStore.getObject("providers") ?? [],
    models: kvStore.getObject("models") ?? [],
    identities: kvStore.getObject("identities") ?? [],
    mcpServers: kvStore.getObject("mcp_servers") ?? [],
  };
}

export async function downloadBackup(data: BackupData): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);
  const defaultName = `talkio-config-${new Date().toISOString().slice(0, 10)}.json`;

  if (window.__TAURI_INTERNALS__) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return false;
      await writeTextFile(filePath, json);
      return true;
    } catch {
      // Fallback to browser download
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function importBackupFromString(text: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(text) as BackupData;

    if (data.version !== "2.0") {
      return { success: false, message: `Unsupported backup version: ${data.version}` };
    }

    if (data.providers) kvStore.setObject("providers", data.providers);
    if (data.models) kvStore.setObject("models", data.models);
    if (data.identities) kvStore.setObject("identities", data.identities);
    if (data.mcpServers) kvStore.setObject("mcp_servers", data.mcpServers);

    const parts = [`${data.providers?.length ?? 0} providers`, `${data.models?.length ?? 0} models`, `${data.identities?.length ?? 0} identities`];
    return { success: true, message: `Imported ${parts.join(", ")}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed to parse backup file" };
  }
}

export async function importBackup(file: File): Promise<{ success: boolean; message: string }> {
  const text = await file.text();
  return importBackupFromString(text);
}

export async function pickAndImportBackup(): Promise<{ success: boolean; message: string } | null> {
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
      if (!file) { resolve(null); return; }
      resolve(await importBackup(file));
    };
    input.click();
  });
}
