/**
 * ChatView — shared chat message list + input (1:1 RN original).
 */
import { useRef, useEffect, useCallback, useMemo, useState, memo } from "react"; // useState used by MessageRow
import { useTranslation } from "react-i18next";
import { IoCopyOutline, IoRefreshOutline, IoVolumeMediumOutline, IoShareOutline, IoTrashOutline, IoPerson, IoAnalyticsOutline, IoChatbubbleOutline } from "../../icons";
import { GitBranch, Wrench, Hourglass, ChevronUp, ChevronDown } from "lucide-react";
import { MessageContent } from "./MessageContent";
import { ChatInput } from "./ChatInput";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useMessages } from "../../hooks/useDatabase";
import type { Message, ConversationParticipant } from "../../../../src/types";
import { MessageStatus } from "../../../../src/types";
import { getAvatarProps } from "../../lib/avatar-utils";
import { useConfirm } from "./ConfirmDialogProvider";

interface ChatViewProps {
  conversationId: string;
  isMobile?: boolean;
  onScrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  modelName?: string;
  onSwitchModel?: () => void;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
}

export function ChatView({ conversationId, isMobile = false, onScrollRef, onScroll, modelName, onSwitchModel, isGroup = false, participants = [] }: ChatViewProps) {
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

  const _internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = onScrollRef ?? _internalScrollRef;
  const isNearBottomRef = useRef(true);

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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    onScroll?.();
  }, [onScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [displayMessages]);

  const handleSend = useCallback(
    (text: string, images?: string[], mentionedModelIds?: string[]) => {
      sendMessage(text, images, { mentionedModelIds });
    },
    [sendMessage],
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

  const hasMessages = displayMessages.length > 0;

  if (!hasMessages && !isGenerating) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
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
            <span className="text-xs font-medium" style={{ color: "var(--primary)" }}>Branch</span>
          </div>
          <button
            onClick={() => switchBranch(null)}
            className="text-xs font-medium px-2.5 py-1 rounded-md active:opacity-70"
            style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}
          >
            ← Main
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto pt-3 pb-2"
      >
        {displayMessages.map((msg) => (
          <MessageRow
            key={msg.id}
            message={msg}
            onCopy={handleCopy}
            onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
            onBranch={msg.role === "assistant" ? handleBranch : undefined}
            onDelete={handleDelete}
          />
        ))}
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
  "volume-medium-outline": IoVolumeMediumOutline,
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
}

const MessageRow = memo(function MessageRow({ message, onCopy, onRegenerate, onBranch, onDelete }: MessageRowProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === MessageStatus.STREAMING;
  const content = (message.content || "").trimEnd();
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  if (isUser) {
    return (
      <div className="mb-6 flex flex-row-reverse items-start gap-3 px-4">
        {/* User Avatar */}
        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--primary)" }}>
          <IoPerson size={20} color="white" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-end gap-1">
          {/* Label */}
          <div className="mr-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You</span>
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

          {/* Bubble */}
          <div
            className="max-w-[80%] rounded-2xl px-4 py-3 border border-solid border-muted-foreground/20"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <p className="text-[15px] leading-relaxed text-white whitespace-pre-wrap">
              {content || (message.images?.length ? "📷" : "")}
            </p>
          </div>

          {/* User action bar */}
          <div className="mr-1 flex items-center gap-0.5">
            {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
            {onDelete && <ActionBtn icon="trash-outline" onClick={() => onDelete(message.id)} color="var(--destructive)" />}
          </div>
        </div>
      </div>
    );
  }

  // ── AI message — exact RN ModelAvatar color logic ──
  const senderName = message.senderName ?? "AI";
  const { color: avatarColor, initials: avatarInitials } = getAvatarProps(senderName);

  return (
    <div className="mb-6 flex items-start gap-3 px-4">
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

        {/* Tool Calls (1:1 RN — below bubble) */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="max-w-[90%] flex flex-col gap-1.5">
            {message.toolCalls.map((tc) => {
              const result = message.toolResults?.find((r) => r.toolCallId === tc.id);
              const isExpanded = expandedTools.has(tc.id);
              return (
                <div key={tc.id} className="overflow-hidden rounded-xl">
                  <button
                    onClick={() => {
                      if (!result) return;
                      setExpandedTools((prev) => {
                        const next = new Set(prev);
                        next.has(tc.id) ? next.delete(tc.id) : next.add(tc.id);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 active:opacity-70"
                    style={{ backgroundColor: "color-mix(in srgb, var(--muted) 80%, transparent)" }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {result
                        ? <Wrench size={16} color="var(--muted-foreground)" />
                        : <Hourglass size={16} color="#d97706" />
                      }
                      <span className="text-[13px] font-medium text-muted-foreground truncate">{tc.name}</span>
                    </div>
                    {result && (
                      isExpanded
                        ? <ChevronUp size={16} color="var(--muted-foreground)" />
                        : <ChevronDown size={16} color="var(--muted-foreground)" />
                    )}
                  </button>
                  {isExpanded && result && (
                    <div className="rounded-xl p-3 mt-1" style={{ backgroundColor: "var(--muted)" }}>
                      <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
                        {result.content.slice(0, 1000)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Assistant action bar (1:1 RN — hidden during streaming) */}
        {!isStreaming && content && (
          <div className="ml-1 flex items-center gap-0.5">
            {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
            {onRegenerate && <ActionBtn icon="refresh-outline" onClick={() => onRegenerate(message.id)} />}
            {content && <ActionBtn icon="volume-medium-outline" onClick={() => {
              if ('speechSynthesis' in window) {
                const speaking = window.speechSynthesis.speaking;
                if (speaking) { window.speechSynthesis.cancel(); }
                else { window.speechSynthesis.speak(new SpeechSynthesisUtterance(content)); }
              }
            }} />}
            {content && <ActionBtn icon="share-outline" onClick={() => {
              if (navigator.share) { navigator.share({ text: content }).catch(() => {}); }
              else { navigator.clipboard.writeText(content); }
            }} />}
            {onBranch && (
              <button onClick={() => onBranch(message.id)} className="rounded-md p-1.5 active:opacity-60" title="Branch from here">
                <GitBranch size={15} color="var(--muted-foreground)" />
              </button>
            )}
            {onDelete && <ActionBtn icon="trash-outline" onClick={() => onDelete(message.id)} color="var(--destructive)" />}
            {message.tokenUsage && (
              <div className="ml-2 flex items-center gap-1 rounded px-1.5 py-0.5" style={{ backgroundColor: "var(--muted)" }}>
                <IoAnalyticsOutline size={11} color="var(--muted-foreground)" />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatTokens(message.tokenUsage.inputTokens)}→{formatTokens(message.tokenUsage.outputTokens)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
