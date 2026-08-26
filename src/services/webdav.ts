/**
 * WebDAV backup sync — manual upload/download of the full backup JSON.
 *
 * Push/pull only, no background scheduling. Errors are thrown with a short code
 * ("auth" / "notfound" / "HTTP <status>") that the settings UI maps to a message.
 */
import { appFetch } from "../lib/http";

export interface WebDavConfig {
  url: string;
  username: string;
  password: string;
}

const BACKUP_FILENAME = "talkio-backup.json";

function authHeader(config: WebDavConfig): string {
  // encodeURIComponent + unescape keeps non-ASCII credentials valid for btoa.
  return "Basic " + btoa(unescape(encodeURIComponent(`${config.username}:${config.password}`)));
}

function fileUrl(config: WebDavConfig): string {
  return config.url.replace(/\/+$/, "") + "/" + BACKUP_FILENAME;
}

/** Verify the server is reachable and the credentials are accepted. */
export async function webdavTest(config: WebDavConfig): Promise<void> {
  const res = await appFetch(fileUrl(config), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("auth");
  // 200 (backup exists) or 404 (reachable, no backup yet) both count as connected.
}

/** Upload the backup JSON, overwriting any existing file. */
export async function webdavUpload(config: WebDavConfig, content: string): Promise<void> {
  const res = await appFetch(fileUrl(config), {
    method: "PUT",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: content,
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("auth");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Download the backup JSON. Throws "notfound" when no backup exists yet. */
export async function webdavDownload(config: WebDavConfig): Promise<string> {
  const res = await appFetch(fileUrl(config), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("auth");
  if (res.status === 404) throw new Error("notfound");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
