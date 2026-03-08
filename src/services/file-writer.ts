/**
 * File Writer — parses AI responses for <file path="..."> tags and writes them
 * to the user's workspace directory via Tauri fs API.
 *
 * Security: paths are sanitized to prevent directory traversal (../).
 * Only writes within the configured workspace directory.
 */

export interface WrittenFile {
  path: string; // relative path within workspace
  fullPath: string; // absolute path on disk
  size: number; // bytes written
}

export interface WorkspaceFileStatus {
  path: string;
  fullPath: string;
  exists: boolean;
  currentContent?: string;
}

/**
 * Extract <file path="...">content</file> blocks from AI message content.
 * Returns array of { path, content } objects.
 */
export function parseFileBlocks(text: string): { path: string; content: string }[] {
  const regex = /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/g;
  const blocks: { path: string; content: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim();
    const content = match[2];
    if (path) {
      blocks.push({ path, content });
    }
  }
  return blocks;
}

/**
 * Sanitize a relative path to prevent directory traversal.
 * Removes leading slashes, ../ components, and normalizes separators.
 */
function sanitizePath(relativePath: string): string | null {
  let p = relativePath.replace(/\\/g, "/");
  p = p.replace(/^\/+/, "");
  const parts = p.split("/").filter((part) => part !== ".." && part !== "." && part !== "");
  if (parts.length === 0) return null;
  return parts.join("/");
}

/** Build an absolute path from workspace root + sanitized relative path. */
function buildFullPath(workspaceDir: string, safePath: string): string {
  const sep = workspaceDir.includes("\\") ? "\\" : "/";
  return workspaceDir.replace(/[/\\]+$/, "") + sep + safePath.replace(/\//g, sep);
}

/**
 * Read existing file statuses for proposed file blocks.
 */
export async function getWorkspaceFileStatuses(
  blocks: { path: string; content: string }[],
  workspaceDir: string,
): Promise<WorkspaceFileStatus[]> {
  if (!window.__TAURI_INTERNALS__ || !workspaceDir) return [];

  const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");
  const statuses: WorkspaceFileStatus[] = [];

  for (const block of blocks) {
    const safePath = sanitizePath(block.path);
    if (!safePath) continue;
    const fullPath = buildFullPath(workspaceDir, safePath);
    const fileExists = await exists(fullPath).catch(() => false);
    let currentContent: string | undefined;
    if (fileExists) {
      currentContent = await readTextFile(fullPath).catch(() => undefined);
    }
    statuses.push({
      path: safePath,
      fullPath,
      exists: fileExists,
      currentContent,
    });
  }

  return statuses;
}

/**
 * Write parsed file blocks to the workspace directory.
 * Requires Tauri environment. Returns list of successfully written files.
 */
export async function writeFilesToWorkspace(
  blocks: { path: string; content: string }[],
  workspaceDir: string,
): Promise<WrittenFile[]> {
  if (!window.__TAURI_INTERNALS__ || !workspaceDir) return [];

  const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const written: WrittenFile[] = [];

  for (const block of blocks) {
    const safePath = sanitizePath(block.path);
    if (!safePath) continue;

    const fullPath = buildFullPath(workspaceDir, safePath);
    const sep = workspaceDir.includes("\\") ? "\\" : "/";
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf(sep));
    if (parentDir && parentDir !== workspaceDir) {
      try {
        await mkdir(parentDir, { recursive: true });
      } catch {
        /* exists */
      }
    }

    try {
      await writeTextFile(fullPath, block.content);
      written.push({ path: safePath, fullPath, size: new Blob([block.content]).size });
    } catch (err) {
      console.error(`[file-writer] Failed to write ${fullPath}:`, err);
    }
  }

  return written;
}

export { readWorkspaceTree } from "./workspace";
