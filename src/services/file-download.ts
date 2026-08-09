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

export async function saveOrShareBlob(
  filename: string,
  content: Blob,
  options: {
    mimeType: string;
    filterName: string;
    filterExtensions: string[];
  },
): Promise<boolean> {
  if ((window as any).__TAURI_INTERNALS__) {
    const nativeShare = (window as any).NativeShare;
    if (nativeShare?.shareBase64File) {
      const dataUrl = await blobToDataUrl(content);
      nativeShare.shareBase64File(filename, dataUrl.split(",")[1], options.mimeType);
      return false;
    }
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await save({
        defaultPath: filename,
        filters: [{ name: options.filterName, extensions: options.filterExtensions }],
      });
      if (!filePath) return false;
      await writeFile(filePath, new Uint8Array(await content.arrayBuffer()));
      return true;
    } catch {
      // Fall back to a browser download.
    }
  }

  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export async function saveOrShareBlobs(
  files: Array<{ filename: string; content: Blob }>,
  options: {
    mimeType: string;
    filterName: string;
    filterExtensions: string[];
  },
): Promise<void> {
  const nativeShare = (window as any).NativeShare;
  if (files.length > 1 && nativeShare?.shareBase64Files) {
    const payload = await Promise.all(
      files.map(async ({ filename, content }) => ({
        filename,
        content: (await blobToDataUrl(content)).split(",")[1],
      })),
    );
    nativeShare.shareBase64Files(JSON.stringify(payload), options.mimeType);
    return;
  }

  for (const file of files) {
    await saveOrShareBlob(file.filename, file.content, options);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read exported file"));
    reader.readAsDataURL(blob);
  });
}
