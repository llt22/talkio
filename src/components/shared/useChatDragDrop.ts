import { useCallback, useRef, useState } from "react";
import { parseFile, type ParsedFile } from "../../lib/file-parser";

export interface DroppedFiles {
  images: string[];
  files: ParsedFile[];
}

export function useChatDragDrop(isMobile: boolean) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);
  const [droppedFiles, setDroppedFiles] = useState<DroppedFiles | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (isMobile) return;
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    },
    [isMobile],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (isMobile) return;
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCountRef.current++;
      setIsDragging(true);
    },
    [isMobile],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragging(false);
      if (isMobile) return;
      if (!e.dataTransfer?.items || e.dataTransfer.items.length === 0) return;
      if (!e.dataTransfer.types.includes("Files")) return;

      // Extract files from DataTransferItems (LobeChat pattern)
      const fileList: File[] = [];
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) fileList.push(f);
        }
      }
      if (fileList.length === 0) return;

      const images: string[] = [];
      const docs: ParsedFile[] = [];
      for (let i = 0; i < Math.min(fileList.length, 4); i++) {
        try {
          const parsed = await parseFile(fileList[i]);
          if (parsed.type === "image") images.push(parsed.content);
          else docs.push(parsed);
        } catch {
          /* skip unsupported */
        }
      }
      if (images.length > 0 || docs.length > 0) setDroppedFiles({ images, files: docs });
    },
    [isMobile],
  );

  const consumeDroppedFiles = useCallback(() => setDroppedFiles(null), []);

  return {
    isDragging,
    droppedFiles,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    consumeDroppedFiles,
  };
}
