/**
 * ChatView — shared chat message list + input (1:1 RN original).
 */
import { useRef, useEffect, useCallback, useMemo, useState, memo } from "react"; // useState used by MessageRow
import { useTranslation } from "react-i18next";
import { IoCopyOutline, IoRefreshOutline, IoVolumeMediumOutline, IoShareOutline, IoTrashOutline, IoPerson, IoAnalyticsOutline, IoChatbubbleOutline } from "react-icons/io5";
import { MessageContent } from "./MessageContent";
import { ChatInput } from "./ChatInput";
import { useChatStore, type ChatState } from "../../stores/chat-store";
import { useMessages } from "../../hooks/useDatabase";
import type { Message } from "../../../../src/types";
import { MessageStatus } from "../../../../src/types";
import { getAvatarProps } from "../../lib/avatar-utils";

interface ChatViewProps {
  conversationId: string;
  isMobile?: boolean;
  onScrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  modelName?: string;
  onSwitchModel?: () => void;
}

export function ChatView({ conversationId, isMobile = false, onScrollRef, onScroll, modelName, onSwitchModel }: ChatViewProps) {
  const { t } = useTranslation();
  const messages = useMessages(conversationId);
  const setCurrentConversation = useChatStore((s: ChatState) => s.setCurrentConversation);
  const isGenerating = useChatStore((s: ChatState) => s.isGenerating);
  const streamingMessage = useChatStore((s: ChatState) => s.streamingMessage);
  const sendMessage = useChatStore((s: ChatState) => s.sendMessage);
  const stopGeneration = useChatStore((s: ChatState) => s.stopGeneration);
  const regenerateMessage = useChatStore((s: ChatState) => s.regenerateMessage);
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
    (text: string, images?: string[]) => { sendMessage(text, images); },
    [sendMessage],
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleRegenerate = useCallback((messageId: string) => {
    regenerateMessage(messageId);
  }, [regenerateMessage]);

  const handleDelete = useCallback((messageId: string) => {
    if (confirm(t("chat.deleteMessageConfirm"))) {
      deleteMessageById(messageId);
    }
  }, [deleteMessageById]);

  const hasMessages = displayMessages.length > 0;

  if (!hasMessages && !isGenerating) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <IoChatbubbleOutline size={48} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
          <p className="mt-4 text-lg font-medium text-muted-foreground">{t("chats.startConversation")}</p>
          <p className="text-sm text-muted-foreground/60 mt-1 text-center">{t("chat.message")}</p>
        </div>
        <ChatInput onSend={handleSend} isGenerating={isGenerating} onStop={stopGeneration} isMobile={isMobile} modelName={modelName} onSwitchModel={onSwitchModel} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
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
  onDelete?: (messageId: string) => void;
}

const MessageRow = memo(function MessageRow({ message, onCopy, onRegenerate, onDelete }: MessageRowProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === MessageStatus.STREAMING;
  const content = (message.content || "").trimEnd();

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

          {/* User images (1:1 RN) */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-w-[80%]">
              {message.images.map((uri: string, idx: number) => (
                <img key={idx} src={uri} className="h-32 w-32 rounded-xl object-cover" />
              ))}
            </div>
          )}

          {/* Bubble */}
          <div
            className="max-w-[80%] rounded-2xl px-4 py-3"
            style={{ backgroundColor: "var(--primary)", borderTopRightRadius: 0 }}
          >
            <p className="text-[15px] leading-relaxed text-white whitespace-pre-wrap">
              {content || (message.images?.length ? "📷" : "")}
            </p>
          </div>

          {/* User action bar (1:1 RN) */}
          <div className="mr-1 flex items-center gap-0.5">
            {onCopy && <ActionBtn icon="copy-outline" onClick={() => onCopy(content)} />}
            {onDelete && <ActionBtn icon="trash-outline" onClick={() => onDelete(message.id)} color="#ef4444" />}
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
      {/* AI Avatar — RN: ModelAvatar name={message.senderName} size="sm" */}
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {avatarInitials}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Label */}
        <div className="ml-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{senderName}</span>
          <span className="text-[10px] text-muted-foreground/60">{formatTime(message.createdAt)}</span>
        </div>

        {/* Main bubble */}
        <div
          className="max-w-[90%] min-w-0 overflow-hidden rounded-2xl px-4 py-3"
          style={{
            backgroundColor: "var(--muted)",
            borderTopLeftRadius: 0,
          }}
        >
          {isStreaming && !content ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-muted-foreground/40 animate-pulse" />
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.3s" }} />
            </div>
          ) : (
            <MessageContent message={message} isStreaming={isStreaming} />
          )}
        </div>

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
            {onDelete && <ActionBtn icon="trash-outline" onClick={() => onDelete(message.id)} color="#ef4444" />}
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
