import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseFileBlocks,
  writeFilesToWorkspace,
  getWorkspaceFileStatuses,
  type WrittenFile,
  type WorkspaceFileStatus,
} from "../../services/file-writer";
import { MessageStatus, type Message } from "../../types";
import { useConfirm, appAlert } from "./ConfirmDialogProvider";
import { useTranslation } from "react-i18next";

export function useFileWriteDetection(
  displayMessages: Message[],
  workspaceDir: string,
  isGenerating: boolean,
) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [writtenFilesMap, setWrittenFilesMap] = useState<Record<string, WrittenFile[]>>({});
  const [pendingFileBlocksMap, setPendingFileBlocksMap] = useState<
    Record<string, { path: string; content: string }[]>
  >({});
  const [pendingFileStatusMap, setPendingFileStatusMap] = useState<
    Record<string, WorkspaceFileStatus[]>
  >({});
  const fileWriteProcessedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isGenerating || !workspaceDir || !displayMessages.length) return;
    const last = displayMessages[displayMessages.length - 1];
    if (last.role !== "assistant" || !last.content || last.status === MessageStatus.STREAMING)
      return;
    if (fileWriteProcessedRef.current.has(last.id)) return;

    const blocks = parseFileBlocks(last.content);
    if (blocks.length === 0) return;
    fileWriteProcessedRef.current.add(last.id);
    setPendingFileBlocksMap((prev) => ({ ...prev, [last.id]: blocks }));
    getWorkspaceFileStatuses(blocks, workspaceDir).then((statuses) => {
      setPendingFileStatusMap((prev) => ({ ...prev, [last.id]: statuses }));
    });
  }, [isGenerating, displayMessages, workspaceDir]);

  const clearPendingFiles = useCallback((messageId: string, appliedPath?: string) => {
    setPendingFileBlocksMap((prev) => {
      const next = { ...prev };
      const blocks = next[messageId] ?? [];
      const filtered = appliedPath ? blocks.filter((b) => b.path !== appliedPath) : [];
      if (filtered.length > 0) next[messageId] = filtered;
      else delete next[messageId];
      return next;
    });
    setPendingFileStatusMap((prev) => {
      const next = { ...prev };
      const statuses = next[messageId] ?? [];
      const filtered = appliedPath ? statuses.filter((s) => s.path !== appliedPath) : [];
      if (filtered.length > 0) next[messageId] = filtered;
      else delete next[messageId];
      return next;
    });
  }, []);

  const handleApplyFileBlocks = useCallback(
    async (messageId: string, targetPath?: string) => {
      const blocks = pendingFileBlocksMap[messageId];
      if (!workspaceDir || !blocks || blocks.length === 0) return;

      const selectedBlocks = targetPath ? blocks.filter((b) => b.path === targetPath) : blocks;
      if (selectedBlocks.length === 0) return;

      const preview = selectedBlocks
        .slice(0, 6)
        .map((b) => `• ${b.path}`)
        .join("\n");
      const extra = selectedBlocks.length > 6 ? `\n… +${selectedBlocks.length - 6} more` : "";
      const ok = await confirm({
        title: targetPath ? t("chat.applyThisFile") : t("chat.applyFiles"),
        description: `${t("chat.applyFilesConfirm")}\n\n${preview}${extra}`,
        confirmText: t("common.save"),
      });
      if (!ok) return;

      const written = await writeFilesToWorkspace(selectedBlocks, workspaceDir);
      if (written.length > 0) {
        setWrittenFilesMap((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), ...written],
        }));
        if (targetPath) clearPendingFiles(messageId, targetPath);
        else clearPendingFiles(messageId);
        await appAlert(t("chat.applyFilesSuccess", { count: written.length }));
      }
    },
    [pendingFileBlocksMap, workspaceDir, confirm, t, clearPendingFiles],
  );

  return {
    writtenFilesMap,
    pendingFileBlocksMap,
    pendingFileStatusMap,
    handleApplyFileBlocks,
  };
}
