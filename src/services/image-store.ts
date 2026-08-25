/**
 * Generated-image storage.
 *
 * Models return images inline as `data:<mime>;base64,...`, which is fine to
 * stream and render but must not reach SQLite: a single image is easily over a
 * megabyte of base64, and a conversation with a handful of them would bloat the
 * message row past anything the app can reasonably load or back up.
 *
 * So a message record stores a *reference* — the file name under
 * `<AppData>/generated-images/` — and the bytes live on disk. Rendering resolves
 * a reference back into a blob URL on demand.
 *
 * Browsers without the Tauri filesystem keep the data URL inline; there is
 * nowhere else to put it. A reference is told apart from an inline image by the
 * `data:` prefix, which a file name can never have.
 */
import { isTauri } from "../lib/platform";

const IMAGE_DIR = "generated-images";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** True when the value is an inline `data:` URL rather than a stored file name. */
export function isInlineImage(ref: string): boolean {
  return ref.startsWith("data:");
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1], bytes };
}

/**
 * Write one generated image to disk and return the reference to persist.
 *
 * Falls back to the data URL when there is no filesystem (browser) or the write
 * fails — losing the image entirely would be worse than a large row.
 */
export async function persistGeneratedImage(dataUrl: string): Promise<string> {
  if (!isTauri || !isInlineImage(dataUrl)) return dataUrl;
  try {
    const { mime, bytes } = parseDataUrl(dataUrl);
    const { writeFile, mkdir, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(IMAGE_DIR, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(IMAGE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const name = `${crypto.randomUUID()}.${EXT_BY_MIME[mime] ?? "png"}`;
    await writeFile(`${IMAGE_DIR}/${name}`, bytes, { baseDir: BaseDirectory.AppData });
    return name;
  } catch (err) {
    console.warn("[image-store] falling back to inline image:", err);
    return dataUrl;
  }
}

/** Persist a whole batch, preserving order. */
export async function persistGeneratedImages(dataUrls: string[]): Promise<string[]> {
  return Promise.all(dataUrls.map(persistGeneratedImage));
}

/**
 * Resolve a stored reference into a URL an `<img>` can load. Inline images pass
 * through unchanged; file references become blob URLs the caller must revoke.
 */
export async function resolveImageUrl(ref: string): Promise<string> {
  if (isInlineImage(ref)) return ref;
  const { readFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  const bytes = await readFile(`${IMAGE_DIR}/${ref}`, { baseDir: BaseDirectory.AppData });
  return URL.createObjectURL(new Blob([bytes as BlobPart]));
}

/**
 * Delete stored images no message references any more.
 *
 * Deletion is a sweep rather than a hook on every delete path (message,
 * conversation, clear-all, backup restore) because a missed hook leaks files
 * forever, while a sweep cannot miss one.
 */
export async function pruneOrphanImages(referenced: Set<string>): Promise<number> {
  if (!isTauri) return 0;
  const { readDir, remove, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(IMAGE_DIR, { baseDir: BaseDirectory.AppData }))) return 0;
  const entries = await readDir(IMAGE_DIR, { baseDir: BaseDirectory.AppData });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile || referenced.has(entry.name)) continue;
    await remove(`${IMAGE_DIR}/${entry.name}`, { baseDir: BaseDirectory.AppData });
    removed++;
  }
  return removed;
}
