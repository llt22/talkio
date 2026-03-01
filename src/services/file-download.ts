/**
 * Unified file download/share utility.
 * Handles platform differences: Tauri desktop (save dialog), Android (NativeShare), browser (blob download).
 *
 * @returns `true` if the file was saved/shared successfully,
 *          `false` if the user cancelled or the share sheet was shown (no explicit confirmation).
 */
export async function saveOrShareFile(
  filename: string,
  content: string,
  options: {
    mimeType: string;
    filterName: string;
    filterExtensions: string[];
  },
): Promise<boolean> {
  if ((window as any).__TAURI_INTERNALS__) {
    // Mobile (Android/iOS): share via native bridge
    const nativeShare = (window as any).NativeShare;
    if (nativeShare) {
      try {
        nativeShare.shareFile(filename, content, options.mimeType);
        return false;
      } catch {
        // fall through to save dialog
      }
    }
    // Desktop Tauri: save dialog
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await save({
        defaultPath: filename,
        filters: [{ name: options.filterName, extensions: options.filterExtensions }],
      });
      if (!filePath) return false;
      await writeTextFile(filePath, content);
      return true;
    } catch {
      // Fallback to browser download
    }
  }

  // Browser fallback
  const blob = new Blob([content], { type: options.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
