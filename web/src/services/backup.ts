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

export function downloadBackup(data: BackupData) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `talkio-config-${new Date().toISOString().slice(0, 10)}.json`;
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
