/**
 * File Writer — parses AI responses for <file path="..."> tags and writes them
 * to the user's workspace directory via Tauri fs API.
 *
 * Security: paths are sanitized to prevent directory traversal (../).
 * Only writes within the configured workspace directory.
 */

export interface WrittenFile {
  path: string;       // relative path within workspace
  fullPath: string;   // absolute path on disk
  size: number;       // bytes written
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
    if (path && content) {
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
  // Normalize separators
  let p = relativePath.replace(/\\/g, "/");
  // Remove leading slashes
  p = p.replace(/^\/+/, "");
  // Split and filter out dangerous components
  const parts = p.split("/").filter((part) => part !== ".." && part !== "." && part !== "");
  if (parts.length === 0) return null;
  return parts.join("/");
}

/**
 * Write parsed file blocks to the workspace directory.
 * Requires Tauri environment. Returns list of successfully written files.
 */
export async function writeFilesToWorkspace(
  blocks: { path: string; content: string }[],
  workspaceDir: string,
): Promise<WrittenFile[]> {
  if (!window.__TAURI_INTERNALS__) return [];
  if (!workspaceDir) return [];

  const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const written: WrittenFile[] = [];

  for (const block of blocks) {
    const safePath = sanitizePath(block.path);
    if (!safePath) continue;

    // Build full path
    const sep = workspaceDir.includes("\\") ? "\\" : "/";
    const fullPath = workspaceDir.replace(/[/\\]+$/, "") + sep + safePath.replace(/\//g, sep);

    // Ensure parent directory exists
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf(sep));
    if (parentDir && parentDir !== workspaceDir) {
      try {
        await mkdir(parentDir, { recursive: true });
      } catch {
        // Directory might already exist
      }
    }

    try {
      await writeTextFile(fullPath, block.content);
      written.push({
        path: safePath,
        fullPath,
        size: new Blob([block.content]).size,
      });
    } catch (err) {
      console.error(`[file-writer] Failed to write ${fullPath}:`, err);
    }
  }

  return written;
}

/**
 * Strip <file path="...">...</file> blocks from message text,
 * returning the clean text without file blocks.
 */
export function stripFileBlocks(text: string): string {
  return text.replace(/<file\s+path=["'][^"']+["']\s*>[\s\S]*?<\/file>/g, "").trim();
}

/**
 * Read the workspace directory tree (up to 2 levels deep, max 200 entries).
 * Returns a compact text listing of files and directories.
 */
export async function readWorkspaceTree(workspaceDir: string): Promise<string> {
  if (!window.__TAURI_INTERNALS__ || !workspaceDir) return "";

  const { readDir } = await import("@tauri-apps/plugin-fs");
  const lines: string[] = [];
  const MAX_ENTRIES = 200;

  try {
    const entries = await readDir(workspaceDir);
    for (const entry of entries) {
      if (lines.length >= MAX_ENTRIES) break;
      if (entry.name?.startsWith(".")) continue; // skip hidden
      if (entry.isDirectory) {
        lines.push(`📁 ${entry.name}/`);
        try {
          const sep = workspaceDir.includes("\\") ? "\\" : "/";
          const subEntries = await readDir(workspaceDir + sep + entry.name);
          for (const sub of subEntries) {
            if (lines.length >= MAX_ENTRIES) break;
            if (sub.name?.startsWith(".")) continue;
            lines.push(`  ${sub.isDirectory ? "📁" : "📄"} ${entry.name}/${sub.name}${sub.isDirectory ? "/" : ""}`);
          }
        } catch { /* permission denied or not readable */ }
      } else {
        lines.push(`📄 ${entry.name}`);
      }
    }
  } catch (err) {
    console.error("[file-writer] Failed to read workspace tree:", err);
    return "";
  }

  return lines.join("\n");
}

/**
 * Read a file from the workspace directory. Returns content or null.
 * Path is sanitized to prevent directory traversal.
 */
export async function readWorkspaceFile(
  relativePath: string,
  workspaceDir: string,
): Promise<string | null> {
  if (!window.__TAURI_INTERNALS__ || !workspaceDir) return null;

  const safePath = sanitizePath(relativePath);
  if (!safePath) return null;

  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const sep = workspaceDir.includes("\\") ? "\\" : "/";
  const fullPath = workspaceDir.replace(/[/\\]+$/, "") + sep + safePath.replace(/\//g, sep);

  try {
    return await readTextFile(fullPath);
  } catch {
    return null;
  }
}
