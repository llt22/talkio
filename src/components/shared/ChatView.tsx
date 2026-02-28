/**
 * ChatView — shared chat message list + input (1:1 RN original).
 */
import { useRef, useEffect, useCallback, useMemo, useState, memo, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { IoCopyOutline, IoRefreshOutline, IoShareOutline, IoTrashOutline, IoPerson, IoAnalyticsOutline, IoChatbubbleOutline } from "../../icons";
import { GitBranch, Wrench, Hourglass, ChevronUp, ChevronDown, Pencil, Check, X } from "lucide-react";
import { MessageContent } from "./MessageContent";
import { ChatInput } from "./ChatInput";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useMessages } from "../../hooks/useDatabase";
import type { Message, ConversationParticipant } from "../../types";
import { MessageStatus } from "../../types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { useConfirm } from "./ConfirmDialogProvider";
import { useStickToBottom } from "use-stick-to-bottom";

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

export function ChatView({ conversationId, isMobile = false, onAtBottomChange, handleRef, modelName, onSwitchModel, isGroup = false, participants = [] }: ChatViewProps) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const activeBranchId = useChatStore((s: ChatState) => s.activeBranchId);
  const messages = useMessages(conversationId, activeBranchId);
  const setCurrentConversation = useChatStore((s: ChatState) => s.setCurrentConversation);
  const isGenerating = useChatStore((s: ChatState) => s.isGenerating);
  const streamingMessage = useChatStore((s: ChatState) => s.streamingMessage);
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

  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({ resize: "instant" });

  useImperativeHandle(handleRef, () => ({
    scrollToBottom: () => scrollToBottom(),
    getScrollElement: () => scrollRef.current,
  }), [scrollToBottom]);

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

  const displayMessages = useMemo(() => {
    if (!streamingMessage) return messages;
    return messages.map((m) => {
      if (m.id === streamingMessage.messageId) {
        return {
          ...m,
          content: streamingMessage.content,
          reasoningContent: streamingMessage.reasoning || null,
          status: MessageStatus.STREAMING,
        };
      }
      return m;
    });
  }, [messages, streamingMessage]);

  const handleSend = useCallback(
    (text: string, mentionedParticipantIds?: string[], images?: string[]) => {
      scrollToBottom();
      sendMessage(text, images, { mentionedParticipantIds });
    },
    [sendMessage, scrollToBottom],
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleRegenerate = useCallback((messageId: string) => {
    regenerateMessage(messageId);
  }, [regenerateMessage]);

  const handleBranch = useCallback(async (messageId: string) => {
    await branchFromMessage(messageId, displayMessages);
  }, [branchFromMessage, displayMessages]);

  const handleDelete = useCallback(async (messageId: string) => {
    const ok = await confirm({
      title: t("common.areYouSure"),
      description: t("chat.deleteMessageConfirm"),
      destructive: true,
    });
    if (ok) deleteMessageById(messageId);
  }, [confirm, deleteMessageById, t]);

  const handleEdit = useCallback((messageId: string, newContent: string) => {
    editMessage(messageId, newContent);
  }, [editMessage]);

  const hasMessages = displayMessages.length > 0;

  if (!hasMessages && !isGenerating) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
        {activeBranchId && (
          <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--background))", borderBottom: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
            <div className="flex items-center gap-2">
              <GitBranch size={14} color="var(--primary)" />
              <span className="text-xs font-medium" style={{ color: "var(--primary)" }}>{t("chat.branch")}</span>
            </div>
            <button onClick={() => switchBranch(null)} className="text-xs font-medium px-2.5 py-1 rounded-md active:opacity-70" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>
              {t("chat.backToMain")}
            </button>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <IoChatbubbleOutline size={48} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
          <p className="mt-4 text-lg font-medium text-muted-foreground">{t("chats.startConversation")}</p>
          <p className="text-sm text-muted-foreground/60 mt-1 text-center">{t("chat.message")}</p>
        </div>
        <ChatInput onSend={handleSend} isGenerating={isGenerating} onStop={stopGeneration} isMobile={isMobile} modelName={modelName} onSwitchModel={onSwitchModel} isGroup={isGroup} participants={participants} hasMessages={false} onStartAutoDiscuss={startAutoDiscuss} onStopAutoDiscuss={stopAutoDiscuss} autoDiscussRemaining={autoDiscussRemaining} autoDiscussTotalRounds={autoDiscussTotalRounds} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* Branch indicator */}
      {activeBranchId && (
        <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--background))", borderBottom: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
          <div className="flex items-center gap-2">
            <GitBranch size={14} color="var(--primary)" />
            <span className="text-xs font-medium" style={{ color: "var(--primary)" }}>{t("chat.branch")}</span>
          </div>
          <button
            onClick={() => switchBranch(null)}
            className="text-xs font-medium px-2.5 py-1 rounded-md active:opacity-70"
            style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}
          >
            {t("chat.backToMain")}
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto pt-3 pb-2"
      >
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

function ActionBtn({ icon, onClick, color }: { icon: string; onClick: () => void; color?: string }) {
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
}

// ── Assistant action bar: primary buttons + ··· overflow menu ──

function AssistantActionBar({ content, message, onCopy, onRegenerate, onBranch, onDelete, t }: {
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
      {onRegenerate && <ActionBtn icon="refresh-outline" onClick={() => onRegenerate(message.id)} />}
      {message.tokenUsage && (
        <div className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5" style={{ backgroundColor: "var(--muted)" }}>
          <IoAnalyticsOutline size={11} color="var(--muted-foreground)" />
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatTokens(message.tokenUsage.inputTokens)}→{formatTokens(message.tokenUsage.outputTokens)}
          </span>
        </div>
      )}

      {/* ··· overflow menu */}
      <div className="relative">
        <button onClick={() => setShowMenu((v) => !v)} className="rounded-md p-1.5 active:opacity-60">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round">
            <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
            <div
              className="absolute left-0 bottom-full mb-1 z-30 min-w-[150px] rounded-xl py-1 shadow-lg"
              style={{ backgroundColor: "var(--card)", border: "0.5px solid var(--border)" }}
            >
              {onBranch && (
                <button
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                  onClick={() => { setShowMenu(false); onBranch(message.id); }}
                >
                  <GitBranch size={15} color="var(--foreground)" />
                  <span className="text-[13px] text-foreground">{t("chat.branchFromHere")}</span>
                </button>
              )}
              <button
                className="w-full flex items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                onClick={() => {
                  setShowMenu(false);
                  if (navigator.share) navigator.share({ text: content }).catch(() => {});
                  else navigator.clipboard.writeText(content);
                }}
              >
                <IoShareOutline size={15} color="var(--foreground)" />
                <span className="text-[13px] text-foreground">{t("chat.export")}</span>
              </button>
              {onDelete && (
                <>
                  <div style={{ height: "0.5px", backgroundColor: "var(--border)", margin: "2px 12px" }} />
                  <button
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 active:opacity-60"
                    onClick={() => { setShowMenu(false); onDelete(message.id); }}
                  >
                    <IoTrashOutline size={15} color="var(--destructive)" />
                    <span className="text-[13px]" style={{ color: "var(--destructive)" }}>{t("common.delete")}</span>
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

const MessageRow = memo(function MessageRow({ message, onCopy, onRegenerate, onBranch, onDelete, onEdit, isGenerating }: MessageRowProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const isStreaming = message.status === MessageStatus.STREAMING;
  const content = (message.content || "").trimEnd();
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
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
      <div className="group mb-6 flex flex-row-reverse items-start gap-3 px-4">
        {/* User Avatar */}
        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--primary)" }}>
          <IoPerson size={20} color="white" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-end gap-1">
          {/* Label */}
          <div className="mr-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("chat.you")}</span>
            <span className="text-[10px] text-muted-foreground/60">{formatTime(message.createdAt)}</span>
          </div>

          {/* User images */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-w-[80%]">
              {message.images.map((uri: string, idx: number) => (
                <img key={idx} src={uri} className="h-32 w-32 rounded-lg object-cover" />
              ))}
            </div>
          )}

          {/* Bubble or Edit textarea */}
          {isEditing ? (
            <div className="w-full max-w-[80%]" style={{ maxWidth: "min(80%, 640px)" }}>
              <div className="rounded-2xl px-3" style={{ backgroundColor: "var(--muted)", border: "1px solid var(--primary)" }}>
                <textarea
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEditing();
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                  }}
                  className="w-full bg-transparent py-3 text-[15px] leading-relaxed text-foreground outline-none resize-none"
                  style={{ minHeight: "60px" }}
                  rows={Math.max(2, editText.split("\n").length)}
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
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
              style={{ backgroundColor: "var(--primary)", maxWidth: "min(80%, 640px)", borderTopRightRadius: 0 }}
            >
              <p className="text-[15px] leading-relaxed text-white whitespace-pre-wrap break-words">
                {content || (message.images?.length ? "📷" : "")}
              </p>
            </div>
          )}

          {/* User action bar */}
          {!isEditing && (
            <div className="mr-1 flex items-center gap-0.5">
              {onEdit && !isGenerating && (
                <button onClick={startEditing} className="rounded-md p-1.5 active:opacity-60" title={t("common.edit")}>
                  <Pencil size={14} color="var(--muted-foreground)" />
                </button>
              )}
              {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
              {onDelete && <ActionBtn icon="trash-outline" onClick={() => onDelete(message.id)} color="var(--destructive)" />}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── AI message — exact RN ModelAvatar color logic ──
  const senderName = message.senderName ?? "AI";
  const { color: avatarColor, initials: avatarInitials } = getAvatarProps(senderName);

  return (
    <div className="group mb-6 flex items-start gap-3 px-4">
      {/* AI Avatar — RN: ModelAvatar name={message.senderName} */}
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {avatarInitials}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Label */}
        <div className="ml-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate max-w-[200px]">{senderName}</span>
          <span className="text-[10px] text-muted-foreground/60">{formatTime(message.createdAt)}</span>
        </div>

        {/* Main bubble — hide when only toolCalls with no content */}
        {(content || isStreaming || !(message.toolCalls && message.toolCalls.length > 0)) && (
          <div
            className="max-w-[90%] min-w-0 overflow-hidden rounded-2xl px-4 py-3"
            style={{
              backgroundColor: "var(--muted)",
              borderTopLeftRadius: 0,
              maxWidth: "min(90%, 720px)",
            }}
          >
            {isStreaming && !content && !message.reasoningContent ? (
              <div className="flex items-center gap-1.5 py-1">
                <span className="inline-block w-[7px] h-[7px] rounded-full bg-muted-foreground/40 animate-pulse" />
                <span className="inline-block w-[7px] h-[7px] rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.15s" }} />
                <span className="inline-block w-[7px] h-[7px] rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.3s" }} />
              </div>
            ) : (
              <MessageContent message={message} isStreaming={isStreaming} />
            )}
          </div>
        )}

        {/* Tool Calls — compact inline cards */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="max-w-[90%] flex flex-col gap-1" style={{ maxWidth: "min(90%, 720px)" }}>
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
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 ${isPending ? "cursor-default" : "active:opacity-70"}`}
                    style={{ backgroundColor: "color-mix(in srgb, var(--muted) 70%, transparent)" }}
                  >
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {isPending
                        ? <Hourglass size={13} color="#d97706" className="animate-spin flex-shrink-0" style={{ animationDuration: "2s" }} />
                        : <Wrench size={13} color="var(--muted-foreground)" className="flex-shrink-0" />
                      }
                      <span className={`text-[12px] font-medium truncate ${isPending ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {isPending ? `${tc.name}…` : tc.name}
                      </span>
                    </div>
                    {!isPending && (
                      isExpanded
                        ? <ChevronUp size={14} color="var(--muted-foreground)" />
                        : <ChevronDown size={14} color="var(--muted-foreground)" />
                    )}
                  </button>
                  {isExpanded && result && (
                    <div className="rounded-lg px-2.5 py-2 mt-0.5" style={{ backgroundColor: "var(--muted)" }}>
                      <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
                        {result.content.slice(0, 1000)}{result.content.length > 1000 ? " …" : ""}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
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
    </div>
  );
});
