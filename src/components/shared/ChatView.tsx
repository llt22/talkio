/**
 * ChatView — shared chat message list + input (1:1 RN original).
 */
import { useRef, useEffect, useCallback, useMemo, useState, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { IoChatbubbleOutline } from "../../icons";
import { GitBranch, Paperclip, ClipboardList } from "lucide-react";
import { ChatInput } from "./ChatInput";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useMessages, useConversation, useTasks } from "../../hooks/useDatabase";
import type { ConversationParticipant, Message, Task } from "../../types";
import { MessageStatus } from "../../types";
import { TaskPromoteDialog } from "./TaskPromoteDialog";
import { TaskPanel } from "./TaskPanel";
import { promoteMessageToTask } from "../../stores/chat-store-actions";
import { useConfirm } from "./ConfirmDialogProvider";
import { useStickToBottom } from "use-stick-to-bottom";
import { MessageRow } from "./MessageRow";
import { useChatDragDrop } from "./useChatDragDrop";
import { useFileWriteDetection } from "./useFileWriteDetection";

export interface ChatViewHandle {
  scrollToBottom: () => void;
  getScrollElement: () => HTMLElement | null;
  scrollToMessage: (messageId: string) => void;
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
  keyboardInset?: number;
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
  keyboardInset = 0,
}: ChatViewProps) {
  const { t, i18n } = useTranslation();
  const { confirm } = useConfirm();
  const activeBranchId = useChatStore((s: ChatState) => s.activeBranchId);
  const messages = useMessages(conversationId, activeBranchId);
  const tasks = useTasks(conversationId);
  const setCurrentConversation = useChatStore((s: ChatState) => s.setCurrentConversation);
  const isGenerating = useChatStore((s: ChatState) => s.isGenerating);
  const streamingMessages = useChatStore((s: ChatState) => s.streamingMessages);
  const sendMessage = useChatStore((s: ChatState) => s.sendMessage);
  const stopGeneration = useChatStore((s: ChatState) => s.stopGeneration);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [promoteSource, setPromoteSource] = useState<Message | null>(null);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
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
      scrollToMessage: (messageId: string) => {
        const el = scrollRef.current?.querySelector(`[data-message-id="${messageId}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      },
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

  const handleRequestSummary = useCallback(
    (participantId: string) => {
      scrollToBottom({ animation: "instant", ignoreEscapes: true, duration: 500 });
      sendMessage(t("chat.summaryRequestText"), undefined, {
        targetParticipantIds: [participantId],
        moderatorSummary: true,
      });
    },
    [sendMessage, scrollToBottom, t],
  );

  // ── Discussion tasks ──
  const tasksByRequestId = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      if (task.requestMessageId) map.set(task.requestMessageId, task);
    }
    return map;
  }, [tasks]);
  const activeTaskCount = useMemo(
    () =>
      tasks.filter(
        (task) => task.status === "running" || task.status === "pending" || task.status === "paused",
      ).length,
    [tasks],
  );

  const handlePromoteToTask = useCallback(
    (message: Message) => {
      if (isGenerating) return;
      setPromoteSource(message);
      setShowPromoteDialog(true);
    },
    [isGenerating],
  );

  const handlePromoteConfirm = useCallback(
    async (title: string, description: string, assigneeParticipantId: string) => {
      if (!promoteSource || isGenerating) return;
      scrollToBottom({ animation: "instant", ignoreEscapes: true, duration: 500 });
      await promoteMessageToTask(
        conversationId,
        promoteSource.id,
        title,
        description,
        assigneeParticipantId,
        sendMessage,
      );
    },
    [promoteSource, isGenerating, conversationId, sendMessage, scrollToBottom],
  );

  // Pausing = aborting the in-flight generation; chat-generation flips the
  // task to paused as part of its abort handling.
  const handlePauseTask = useCallback(
    (_taskId: string) => {
      stopGeneration();
    },
    [stopGeneration],
  );

  // Resume and retry both re-trigger execution from the persisted request.
  const handleResumeTask = useCallback(
    (taskId: string) => {
      if (isGenerating) return;
      const task = tasks.find((item) => item.id === taskId);
      if (!task?.requestMessageId || !task.assigneeParticipantId) return;
      scrollToBottom({ animation: "instant", ignoreEscapes: true, duration: 500 });
      sendMessage(t("chat.taskRequestText", { title: task.title }), undefined, {
        reuseUserMessageId: task.requestMessageId,
        targetParticipantIds: [task.assigneeParticipantId],
        taskId,
      });
    },
    [isGenerating, tasks, sendMessage, scrollToBottom, t],
  );

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      if (handleRef && typeof handleRef === "object" && "current" in handleRef) {
        handleRef.current?.scrollToMessage(messageId);
      }
    },
    [handleRef],
  );

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

  // ── Drag & drop ──
  const {
    isDragging,
    droppedFiles,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    consumeDroppedFiles,
  } = useChatDragDrop(isMobile);

  // ── Auto-write files from AI responses ──
  const conversation = useConversation(conversationId);
  const workspaceDir = !isMobile ? conversation?.workspaceDir || "" : "";
  const { writtenFilesMap, pendingFileBlocksMap, pendingFileStatusMap, handleApplyFileBlocks } =
    useFileWriteDetection(displayMessages, workspaceDir, isGenerating);

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
          keyboardInset={keyboardInset}
          onStartAutoDiscuss={startAutoDiscuss}
          onStopAutoDiscuss={stopAutoDiscuss}
          autoDiscussRemaining={autoDiscussRemaining}
          autoDiscussTotalRounds={autoDiscussTotalRounds}
          onRequestSummary={isGroup ? handleRequestSummary : undefined}
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
      <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto pt-3 pb-2">
        <div ref={contentRef}>
          {displayMessages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              participants={participants}
              onCopy={handleCopy}
              onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
              onBranch={msg.role === "assistant" ? handleBranch : undefined}
              onDelete={handleDelete}
              onEdit={msg.role === "user" ? handleEdit : undefined}
              isGenerating={isGenerating}
              writtenFiles={writtenFilesMap[msg.id]}
              pendingFileBlocks={!isMobile ? pendingFileBlocksMap[msg.id] : undefined}
              pendingFileStatuses={!isMobile ? pendingFileStatusMap[msg.id] : undefined}
              onApplyFileBlocks={!isMobile ? handleApplyFileBlocks : undefined}
              onPromoteToTask={msg.role === "assistant" && !isGenerating ? handlePromoteToTask : undefined}
              tasksByRequestId={tasksByRequestId}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onRetryTask={handleResumeTask}
            />
          ))}
        </div>
      </div>
        {/* Floating tasks entry — visible whenever the conversation has tasks */}
        {(tasks.length > 0 || isGroup) && (
          <button
            onClick={() => setShowTaskPanel(true)}
            className="absolute top-2 right-3 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-opacity hover:opacity-100 active:opacity-70"
            style={{
              backgroundColor: "color-mix(in srgb, var(--card) 92%, transparent)",
              border: "0.5px solid var(--border)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
              opacity: tasks.length > 0 ? 0.9 : 0.55,
            }}
            title={t("chat.tasks")}
          >
            <ClipboardList size={14} color="var(--muted-foreground)" />
            {activeTaskCount > 0 && (
              <span
                className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: "var(--primary)" }}
              >
                {activeTaskCount}
              </span>
            )}
          </button>
        )}
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
        keyboardInset={keyboardInset}
        onStartAutoDiscuss={startAutoDiscuss}
        onStopAutoDiscuss={stopAutoDiscuss}
        autoDiscussRemaining={autoDiscussRemaining}
        autoDiscussTotalRounds={autoDiscussTotalRounds}
        externalFiles={droppedFiles}
        onExternalFilesConsumed={consumeDroppedFiles}
        onRequestSummary={isGroup ? handleRequestSummary : undefined}
      />

      <TaskPromoteDialog
        open={showPromoteDialog}
        sourceMessage={promoteSource}
        participants={participants}
        onOpenChange={(open) => {
          setShowPromoteDialog(open);
          if (!open) setPromoteSource(null);
        }}
        onConfirm={handlePromoteConfirm}
      />
      <TaskPanel
        open={showTaskPanel}
        onOpenChange={setShowTaskPanel}
        tasks={tasks}
        participants={participants}
        onPause={handlePauseTask}
        onResume={handleResumeTask}
        onRetry={handleResumeTask}
        onJumpToRequest={handleJumpToMessage}
      />
    </div>
  );
}
