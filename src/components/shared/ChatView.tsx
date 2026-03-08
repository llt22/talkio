/**
 * ChatView — shared chat message list + input (1:1 RN original).
 */
import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  memo,
  useImperativeHandle,
} from "react";
import { useTranslation } from "react-i18next";
import {
  IoCopyOutline,
  IoRefreshOutline,
  IoShareOutline,
  IoTrashOutline,
  IoAnalyticsOutline,
  IoChatbubbleOutline,
} from "../../icons";
import {
  GitBranch,
  Wrench,
  Hourglass,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  X,
  FileText,
  Paperclip,
  FolderOpen,
  Save,
} from "lucide-react";
import { MessageContent } from "./MessageContent";
import { ChatInput } from "./ChatInput";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useMessages, useConversation } from "../../hooks/useDatabase";
import type { Message, ConversationParticipant } from "../../types";
import { MessageStatus } from "../../types";
import { parseFile, type ParsedFile } from "../../lib/file-parser";
import { getAvatarProps } from "../../lib/avatar-utils";
import { useConfirm } from "./ConfirmDialogProvider";
import { useStickToBottom } from "use-stick-to-bottom";
import {
  parseFileBlocks,
  writeFilesToWorkspace,
  getWorkspaceFileStatuses,
  type WrittenFile,
  type WorkspaceFileStatus,
} from "../../services/file-writer";
import { appAlert } from "./ConfirmDialogProvider";

export interface ChatViewHandle {
  scrollToBottom: () => void;
  getScrollElement: () => HTMLElement | null;
}

interface ChatViewProps {
  conversationId: string;
  isMobile?: boolean;
  onAtBottomChange?: (isAtBottom: boolean) => void;
  handleRef?: React.Ref<ChatViewHandle>;
  modelName?: string;
  onSwitchModel?: () => void;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
}

export function ChatView({
  conversationId,
  isMobile = false,
  onAtBottomChange,
  handleRef,
  modelName,
  onSwitchModel,
  isGroup = false,
  participants = [],
}: ChatViewProps) {
  const { t, i18n } = useTranslation();
  const { confirm } = useConfirm();
  const activeBranchId = useChatStore((s: ChatState) => s.activeBranchId);
  const messages = useMessages(conversationId, activeBranchId);
  const setCurrentConversation = useChatStore((s: ChatState) => s.setCurrentConversation);
  const isGenerating = useChatStore((s: ChatState) => s.isGenerating);
  const streamingMessages = useChatStore((s: ChatState) => s.streamingMessages);
  const sendMessage = useChatStore((s: ChatState) => s.sendMessage);
  const stopGeneration = useChatStore((s: ChatState) => s.stopGeneration);
  const startAutoDiscuss = useChatStore((s: ChatState) => s.startAutoDiscuss);
  const stopAutoDiscuss = useChatStore((s: ChatState) => s.stopAutoDiscuss);
  const autoDiscussRemaining = useChatStore((s: ChatState) => s.autoDiscussRemaining);
  const autoDiscussTotalRounds = useChatStore((s: ChatState) => s.autoDiscussTotalRounds);
  const regenerateMessage = useChatStore((s: ChatState) => s.regenerateMessage);
  const branchFromMessage = useChatStore((s: ChatState) => s.branchFromMessage);
  const switchBranch = useChatStore((s: ChatState) => s.switchBranch);
  const deleteMessageById = useChatStore((s: ChatState) => s.deleteMessageById);
  const editMessage = useChatStore((s: ChatState) => s.editMessage);

  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    resize: "instant",
  });

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToBottom: () => scrollToBottom(),
      getScrollElement: () => scrollRef.current,
    }),
    [scrollToBottom],
  );

  const prevIsAtBottom = useRef(isAtBottom);
  useEffect(() => {
    if (prevIsAtBottom.current !== isAtBottom) {
      prevIsAtBottom.current = isAtBottom;
      onAtBottomChange?.(isAtBottom);
    }
  }, [isAtBottom, onAtBottomChange]);

  useEffect(() => {
    setCurrentConversation(conversationId);
  }, [conversationId, setCurrentConversation]);

  // Re-lock scroll when streaming starts — covers the gap after handleSend's initial lock
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (isGenerating && !wasGenerating.current) {
      scrollToBottom({ animation: "instant" });
    }
    wasGenerating.current = isGenerating;
  }, [isGenerating, scrollToBottom]);

  const displayMessages = useMemo(() => {
    if (streamingMessages.length === 0) return messages;
    const streamMap = new Map(streamingMessages.map((sm) => [sm.messageId, sm]));
    const foundIds = new Set<string>();
    const mapped = messages.map((m) => {
      const sm = streamMap.get(m.id);
      if (sm) {
        foundIds.add(m.id);
        return {
          ...m,
          content: sm.content,
          reasoningContent: sm.reasoning || null,
          status: MessageStatus.STREAMING,
        };
      }
      return m;
    });
    // Append synthetic entries for streaming messages not yet loaded from DB
    for (const sm of streamingMessages) {
      if (!foundIds.has(sm.messageId)) {
        mapped.push({
          id: sm.messageId,
          conversationId: conversationId,
          role: "assistant",
          senderModelId: null,
          senderName: "",
          identityId: null,
          participantId: null,
          content: sm.content,
          images: [],
          generatedImages: [],
          reasoningContent: sm.reasoning || null,
          reasoningDuration: null,
          toolCalls: [],
          toolResults: [],
          branchId: null,
          parentMessageId: null,
          isStreaming: true,
          status: MessageStatus.STREAMING,
          errorMessage: null,
          tokenUsage: null,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return mapped;
  }, [messages, streamingMessages, conversationId]);

  const handleSend = useCallback(
    (text: string, mentionedParticipantIds?: string[], images?: string[]) => {
      // Use "instant" animation + ignoreEscapes to lock scroll to bottom
      // throughout the entire send → stream cycle, preventing race conditions
      // where isAtBottom becomes false between message insert and DOM render.
      scrollToBottom({ animation: "instant", ignoreEscapes: true, duration: 500 });
      sendMessage(text, images, { mentionedParticipantIds });
    },
    [sendMessage, scrollToBottom],
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      regenerateMessage(messageId);
    },
    [regenerateMessage],
  );

  const handleBranch = useCallback(
    async (messageId: string) => {
      await branchFromMessage(messageId, displayMessages);
    },
    [branchFromMessage, displayMessages],
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      const ok = await confirm({
        title: t("common.areYouSure"),
        description: t("chat.deleteMessageConfirm"),
        destructive: true,
      });
      if (ok) deleteMessageById(messageId);
    },
    [confirm, deleteMessageById, t],
  );

  const handleEdit = useCallback(
    (messageId: string, newContent: string) => {
      editMessage(messageId, newContent);
    },
    [editMessage],
  );

  const hasMessages = displayMessages.length > 0;

  // ── Drag & drop zone (whole chat area) ──
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);
  const [droppedFiles, setDroppedFiles] = useState<{
    images: string[];
    files: ParsedFile[];
  } | null>(null);

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

  // ── Auto-write files from AI responses ──
  const conversation = useConversation(conversationId);
  const workspaceDir = conversation?.workspaceDir || "";
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

  const branchBanner = activeBranchId ? (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{
        backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--background))",
        borderBottom: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
      }}
    >
      <div className="flex items-center gap-2">
        <GitBranch size={14} color="var(--primary)" />
        <span className="text-xs font-medium" style={{ color: "var(--primary)" }}>
          {t("chat.branch")}
        </span>
      </div>
      <button
        onClick={() => switchBranch(null)}
        className="rounded-md px-2.5 py-1 text-xs font-medium active:opacity-70"
        style={{
          backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)",
          color: "var(--primary)",
        }}
      >
        {t("chat.backToMain")}
      </button>
    </div>
  ) : null;

  if (!hasMessages && !isGenerating) {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: "var(--background)" }}>
        {branchBanner}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <IoChatbubbleOutline size={48} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
          <p className="text-muted-foreground mt-4 text-lg font-medium">
            {t("chats.startConversation")}
          </p>
          <p className="text-muted-foreground/60 mt-1 text-center text-sm">{t("chat.message")}</p>
        </div>
        <ChatInput
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={stopGeneration}
          isMobile={isMobile}
          modelName={modelName}
          onSwitchModel={onSwitchModel}
          isGroup={isGroup}
          participants={participants}
          hasMessages={false}
          onStartAutoDiscuss={startAutoDiscuss}
          onStopAutoDiscuss={stopAutoDiscuss}
          autoDiscussRemaining={autoDiscussRemaining}
          autoDiscussTotalRounds={autoDiscussTotalRounds}
        />
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col"
      style={{ backgroundColor: "var(--background)" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            backgroundColor: "color-mix(in srgb, var(--primary) 8%, var(--background) 92%)",
            border: "2px dashed var(--primary)",
            borderRadius: 12,
          }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Paperclip size={28} color="var(--primary)" />
            <span className="text-sm font-medium" style={{ color: "var(--primary)" }}>
              {t("chat.dropFiles")}
            </span>
          </div>
        </div>
      )}
      {branchBanner}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pt-3 pb-2">
        <div ref={contentRef}>
          {displayMessages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              onCopy={handleCopy}
              onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
              onBranch={msg.role === "assistant" ? handleBranch : undefined}
              onDelete={handleDelete}
              onEdit={msg.role === "user" ? handleEdit : undefined}
              isGenerating={isGenerating}
              writtenFiles={writtenFilesMap[msg.id]}
              pendingFileBlocks={pendingFileBlocksMap[msg.id]}
              pendingFileStatuses={pendingFileStatusMap[msg.id]}
              onApplyFileBlocks={handleApplyFileBlocks}
            />
          ))}
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        onStop={stopGeneration}
        isMobile={isMobile}
        modelName={modelName}
        onSwitchModel={onSwitchModel}
        isGroup={isGroup}
        participants={participants}
        hasMessages={hasMessages}
        onStartAutoDiscuss={startAutoDiscuss}
        onStopAutoDiscuss={stopAutoDiscuss}
        autoDiscussRemaining={autoDiscussRemaining}
        autoDiscussTotalRounds={autoDiscussTotalRounds}
        externalFiles={droppedFiles}
        onExternalFilesConsumed={() => setDroppedFiles(null)}
      />
    </div>
  );
}

// ── Ionicons-style action button (1:1 RN ActionButton) ──

const ICON_MAP: Record<string, React.FC<{ size: number; color?: string }>> = {
  "copy-outline": IoCopyOutline,
  "refresh-outline": IoRefreshOutline,
  "share-outline": IoShareOutline,
  "trash-outline": IoTrashOutline,
};

function ActionBtn({
  icon,
  onClick,
  color,
}: {
  icon: string;
  onClick: () => void;
  color?: string;
}) {
  const IconComp = ICON_MAP[icon];
  if (!IconComp) return null;
  return (
    <button onClick={onClick} className="rounded-md p-1.5 active:opacity-60" title={icon}>
      <IconComp size={15} color={color ?? "var(--muted-foreground)"} />
    </button>
  );
}

// ── Token usage badge (1:1 RN) ──

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Message Bubble (1:1 RN MessageBubble) ──

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

interface MessageRowProps {
  message: Message;
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  isGenerating?: boolean;
  writtenFiles?: WrittenFile[];
  pendingFileBlocks?: { path: string; content: string }[];
  pendingFileStatuses?: WorkspaceFileStatus[];
  onApplyFileBlocks?: (messageId: string, targetPath?: string) => void;
}

// ── Assistant action bar: primary buttons + ··· overflow menu ──

function AssistantActionBar({
  content,
  message,
  onCopy,
  onRegenerate,
  onBranch,
  onDelete,
  t,
}: {
  content: string;
  message: Message;
  onCopy?: (c: string) => void;
  onRegenerate?: (id: string) => void;
  onBranch?: (id: string) => void;
  onDelete?: (id: string) => void;
  t: (key: string) => string;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="ml-1 flex items-center gap-0.5">
      {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
      {onRegenerate && (
        <ActionBtn icon="refresh-outline" onClick={() => onRegenerate(message.id)} />
      )}
      {message.tokenUsage && (
        <div
          className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5"
          style={{ backgroundColor: "var(--muted)" }}
        >
          <IoAnalyticsOutline size={11} color="var(--muted-foreground)" />
          <span className="text-muted-foreground font-mono text-[10px]">
            {formatTokens(message.tokenUsage.inputTokens)}→
            {formatTokens(message.tokenUsage.outputTokens)}
          </span>
        </div>
      )}

      {/* ··· overflow menu */}
      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="rounded-md p-1.5 active:opacity-60"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
            <div
              className="absolute bottom-full left-0 z-30 mb-1 min-w-[150px] rounded-xl py-1 shadow-lg"
              style={{ backgroundColor: "var(--card)", border: "0.5px solid var(--border)" }}
            >
              {onBranch && (
                <button
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                  onClick={() => {
                    setShowMenu(false);
                    onBranch(message.id);
                  }}
                >
                  <GitBranch size={15} color="var(--foreground)" />
                  <span className="text-foreground text-[13px]">{t("chat.branchFromHere")}</span>
                </button>
              )}
              <button
                className="flex w-full items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                onClick={() => {
                  setShowMenu(false);
                  if (navigator.share) navigator.share({ text: content }).catch(() => {});
                  else navigator.clipboard.writeText(content);
                }}
              >
                <IoShareOutline size={15} color="var(--foreground)" />
                <span className="text-foreground text-[13px]">{t("chat.export")}</span>
              </button>
              {onDelete && (
                <>
                  <div
                    style={{
                      height: "0.5px",
                      backgroundColor: "var(--border)",
                      margin: "2px 12px",
                    }}
                  />
                  <button
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(message.id);
                    }}
                  >
                    <IoTrashOutline size={15} color="var(--destructive)" />
                    <span className="text-[13px]" style={{ color: "var(--destructive)" }}>
                      {t("common.delete")}
                    </span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  onCopy,
  onRegenerate,
  onBranch,
  onDelete,
  onEdit,
  isGenerating,
  writtenFiles,
  pendingFileBlocks,
  pendingFileStatuses,
  onApplyFileBlocks,
}: MessageRowProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const isStreaming = message.status === MessageStatus.STREAMING;
  const rawContent = (message.content || "").trimEnd();

  // Parse out <file> tags: extract names for chips, return clean user text
  const { displayText: content, fileNames } = useMemo(() => {
    const names: string[] = [];
    const cleaned = rawContent.replace(
      /<file\s+path=["']([^"']+)["']\s*>[\s\S]*?<\/file>\s*/g,
      (_m, path) => {
        names.push(path);
        return "";
      },
    );
    return { displayText: cleaned.trimStart(), fileNames: names };
  }, [rawContent]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedPendingFiles, setExpandedPendingFiles] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = useCallback(() => {
    setEditText(content);
    setIsEditing(true);
    // Auto-focus after render
    setTimeout(() => editRef.current?.focus(), 50);
  }, [content]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);

  const confirmEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === content) {
      cancelEditing();
      return;
    }
    onEdit?.(message.id, trimmed);
    setIsEditing(false);
    setEditText("");
  }, [editText, content, onEdit, message.id, cancelEditing]);

  if (isUser) {
    return (
      <div className="group mb-6 flex flex-col items-end gap-1 px-4">
        {/* Label */}
        <div className="mr-1 flex items-baseline gap-2">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
            {t("chat.you")}
          </span>
          <span className="text-muted-foreground/60 text-[10px]">
            {formatTime(message.createdAt)}
          </span>
        </div>

        {/* User images */}
        {message.images && message.images.length > 0 && (
          <div className="flex max-w-[80%] flex-wrap gap-1.5">
            {message.images.map((uri: string, idx: number) => (
              <img key={idx} src={uri} className="h-32 w-32 rounded-lg object-cover" />
            ))}
          </div>
        )}

        {/* Attached file chips */}
        {fileNames.length > 0 && !isEditing && (
          <div className="flex max-w-[80%] flex-wrap gap-1" style={{ maxWidth: "min(80%, 640px)" }}>
            {fileNames.map((name, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 rounded-lg px-2 py-1"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 80%, white)",
                  opacity: 0.9,
                }}
              >
                <FileText size={12} color="white" className="flex-shrink-0" />
                <span className="max-w-[140px] truncate text-[11px] font-medium text-white">
                  {name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Bubble or Edit textarea */}
        {isEditing ? (
          <div className="w-full max-w-[80%]" style={{ maxWidth: "min(80%, 640px)" }}>
            <div
              className="rounded-2xl px-3"
              style={{ backgroundColor: "var(--muted)", border: "1px solid var(--primary)" }}
            >
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEditing();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    confirmEdit();
                  }
                }}
                className="text-foreground w-full resize-none bg-transparent py-3 text-[15px] leading-relaxed outline-none"
                style={{ minHeight: "60px" }}
                rows={Math.max(2, editText.split("\n").length)}
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={cancelEditing}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium active:opacity-70"
                style={{ backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }}
              >
                <X size={14} />
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmEdit}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-white active:opacity-70"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <Check size={14} />
                {t("common.save")}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="max-w-[80%] rounded-2xl px-4 py-3"
            style={{
              backgroundColor: "var(--primary)",
              maxWidth: "min(80%, 640px)",
              borderTopRightRadius: 0,
            }}
          >
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-white">
              {content || (message.images?.length ? "📷" : "")}
            </p>
          </div>
        )}

        {/* User action bar */}
        {!isEditing && (
          <div className="mr-1 flex items-center gap-0.5">
            {onEdit && !isGenerating && (
              <button
                onClick={startEditing}
                className="rounded-md p-1.5 active:opacity-60"
                title={t("common.edit")}
              >
                <Pencil size={14} color="var(--muted-foreground)" />
              </button>
            )}
            {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
            {onDelete && (
              <ActionBtn
                icon="trash-outline"
                onClick={() => onDelete(message.id)}
                color="var(--destructive)"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── AI message ──
  const senderName = message.senderName ?? "AI";
  const { color: senderColor } = getAvatarProps(senderName);

  return (
    <div className="group mb-6 flex flex-col gap-1 px-4">
      {/* Label */}
      <div className="ml-1 flex items-baseline gap-2">
        <span
          className="max-w-[200px] truncate text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: senderColor }}
        >
          {senderName}
        </span>
        <span className="text-muted-foreground/60 text-[10px]">
          {formatTime(message.createdAt)}
        </span>
      </div>

      {/* Main bubble — hide when only toolCalls with no content */}
      {(content || isStreaming || !(message.toolCalls && message.toolCalls.length > 0)) && (
        <div
          className="min-w-0 overflow-hidden rounded-2xl px-4 py-3"
          style={{
            backgroundColor: "var(--muted)",
            borderTopLeftRadius: 0,
            maxWidth: 720,
          }}
        >
          {isStreaming && !content && !message.reasoningContent ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="bg-muted-foreground/40 inline-block h-[7px] w-[7px] animate-pulse rounded-full" />
              <span
                className="bg-muted-foreground/40 inline-block h-[7px] w-[7px] animate-pulse rounded-full"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="bg-muted-foreground/40 inline-block h-[7px] w-[7px] animate-pulse rounded-full"
                style={{ animationDelay: "0.3s" }}
              />
            </div>
          ) : (
            <MessageContent message={message} isStreaming={isStreaming} />
          )}
        </div>
      )}

      {/* Tool Calls — compact inline cards */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1" style={{ maxWidth: 720 }}>
          {message.toolCalls.map((tc) => {
            const result = message.toolResults?.find((r) => r.toolCallId === tc.id);
            const isExpanded = expandedTools.has(tc.id);
            const isPending = !result;
            return (
              <div key={tc.id} className="overflow-hidden rounded-lg">
                <button
                  onClick={() => {
                    if (isPending) return;
                    setExpandedTools((prev) => {
                      const next = new Set(prev);
                      next.has(tc.id) ? next.delete(tc.id) : next.add(tc.id);
                      return next;
                    });
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 ${isPending ? "cursor-default" : "active:opacity-70"}`}
                  style={{ backgroundColor: "color-mix(in srgb, var(--muted) 70%, transparent)" }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {isPending ? (
                      <Hourglass
                        size={13}
                        color="#d97706"
                        className="flex-shrink-0 animate-spin"
                        style={{ animationDuration: "2s" }}
                      />
                    ) : (
                      <Wrench size={13} color="var(--muted-foreground)" className="flex-shrink-0" />
                    )}
                    <span
                      className={`truncate text-[12px] font-medium ${isPending ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {isPending ? `${tc.name}…` : tc.name}
                    </span>
                  </div>
                  {!isPending &&
                    (isExpanded ? (
                      <ChevronUp size={14} color="var(--muted-foreground)" />
                    ) : (
                      <ChevronDown size={14} color="var(--muted-foreground)" />
                    ))}
                </button>
                {isExpanded && result && (
                  <div
                    className="mt-0.5 rounded-lg px-2.5 py-2"
                    style={{ backgroundColor: "var(--muted)" }}
                  >
                    <p className="text-muted-foreground text-[11px] leading-relaxed break-all whitespace-pre-wrap">
                      {result.content.slice(0, 1000)}
                      {result.content.length > 1000 ? " …" : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending generated files */}
      {pendingFileBlocks && pendingFileBlocks.length > 0 && (
        <div className="mt-1 flex flex-col gap-2" style={{ maxWidth: 720 }}>
          <div className="flex flex-col gap-2">
            {pendingFileBlocks.map((block, idx) => {
              const status = pendingFileStatuses?.find((s) => s.path === block.path);
              const isExpanded = expandedPendingFiles.has(block.path);
              const previewText = (status?.exists ? status.currentContent : block.content) || "";
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-lg"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--secondary) 80%, transparent)",
                    border: "0.5px solid color-mix(in srgb, var(--border) 80%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <FileText size={13} color="var(--muted-foreground)" className="flex-shrink-0" />
                    <span className="text-foreground min-w-0 flex-1 truncate text-[12px] font-medium">
                      {block.path}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: status?.exists
                          ? "color-mix(in srgb, var(--destructive) 10%, transparent)"
                          : "color-mix(in srgb, var(--primary) 10%, transparent)",
                        color: status?.exists ? "var(--destructive)" : "var(--primary)",
                      }}
                    >
                      {status?.exists ? t("chat.overwrite") : t("chat.create")}
                    </span>
                    <button
                      onClick={() =>
                        setExpandedPendingFiles((prev) => {
                          const next = new Set(prev);
                          next.has(block.path) ? next.delete(block.path) : next.add(block.path);
                          return next;
                        })
                      }
                      className="rounded p-1 active:opacity-70"
                      title={t("chat.previewFile")}
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} color="var(--muted-foreground)" />
                      ) : (
                        <ChevronDown size={14} color="var(--muted-foreground)" />
                      )}
                    </button>
                    {onApplyFileBlocks && (
                      <button
                        onClick={() => onApplyFileBlocks(message.id, block.path)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-opacity active:opacity-70"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--muted))",
                          color: "var(--primary)",
                        }}
                      >
                        <Save size={12} className="flex-shrink-0" />
                        {t("chat.applyThisFile")}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div
                      className="border-t px-2.5 py-2"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
                    >
                      {status?.exists && status.currentContent !== undefined && (
                        <div className="mb-2">
                          <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                            {t("chat.currentFile")}
                          </div>
                          <pre className="text-muted-foreground max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                            {status.currentContent.slice(0, 1200)}
                            {status.currentContent.length > 1200 ? "\n…" : ""}
                          </pre>
                        </div>
                      )}
                      <div>
                        <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                          {t("chat.generatedFile")}
                        </div>
                        <pre className="text-foreground max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                          {block.content.slice(0, 1600)}
                          {block.content.length > 1600 ? "\n…" : ""}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {onApplyFileBlocks && pendingFileBlocks.length > 1 && (
            <div>
              <button
                onClick={() => onApplyFileBlocks(message.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity active:opacity-70"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--muted))",
                  color: "var(--primary)",
                  border: "0.5px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                }}
              >
                <Save size={13} className="flex-shrink-0" />
                {t("chat.applyFiles")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Written files chips */}
      {writtenFiles && writtenFiles.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5" style={{ maxWidth: 720 }}>
          {writtenFiles.map((wf, idx) => (
            <button
              key={idx}
              onClick={async () => {
                if (!window.__TAURI_INTERNALS__) return;
                try {
                  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
                  await revealItemInDir(wf.fullPath);
                } catch {
                  /* fallback: do nothing */
                }
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-opacity active:opacity-70"
              style={{
                backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--muted))",
                border: "0.5px solid color-mix(in srgb, var(--primary) 20%, transparent)",
              }}
              title={wf.fullPath}
            >
              <Save size={13} color="var(--primary)" className="flex-shrink-0" />
              <span
                className="max-w-[200px] truncate text-[12px] font-medium"
                style={{ color: "var(--primary)" }}
              >
                {wf.path}
              </span>
              <FolderOpen size={12} color="var(--muted-foreground)" className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Assistant action bar — primary: copy + regenerate, secondary: ··· menu */}
      {!isStreaming && content && (
        <AssistantActionBar
          content={content}
          message={message}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          onBranch={onBranch}
          onDelete={onDelete}
          t={t}
        />
      )}
    </div>
  );
});
