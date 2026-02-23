import React, { useState, useCallback } from "react";
import { View, Text, Pressable, Platform, ActionSheetIOS } from "react-native";
import { Image } from "expo-image";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { ModelAvatar } from "../common/ModelAvatar";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";
import { useThemeColors } from "../../hooks/useThemeColors";
import type { Message, MessageBlock } from "../../types";
import { MessageBlockType, MessageBlockStatus, MessageStatus } from "../../types";

interface MessageBubbleProps {
  message: Message;
  blocks?: MessageBlock[];
  isGroup?: boolean;
  renderMarkdown?: boolean;
  labelYou?: string;
  labelThoughtProcess?: string;
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onTTS?: (content: string) => void;
  onShare?: (content: string) => void;
}

function ActionButton({ icon, onPress, color }: { icon: string; onPress: () => void; color?: string }) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} className="rounded-md p-1.5 active:opacity-60" hitSlop={6}>
      <Ionicons name={icon as any} size={15} color={color ?? colors.searchIcon} />
    </Pressable>
  );
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  blocks,
  isGroup = false,
  renderMarkdown = true,
  labelYou = "You",
  labelThoughtProcess = "Thought Process",
  onCopy,
  onRegenerate,
  onDelete,
  onTTS,
  onShare,
}: MessageBubbleProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const colors = useThemeColors();
  const isUser = message.role === "user";

  // Resolve content from blocks (preferred) or flat message fields (fallback)
  const mainTextBlock = blocks?.find((b) => b.type === MessageBlockType.MAIN_TEXT);
  const thinkingBlock = blocks?.find((b) => b.type === MessageBlockType.THINKING);
  const rawContent = mainTextBlock ? mainTextBlock.content : message.content;
  const markdownContent = isUser ? rawContent : rawContent.trimEnd();
  const displayContent = markdownContent;
  const reasoningContent = thinkingBlock ? thinkingBlock.content : message.reasoningContent;
  const isStreaming = message.status === MessageStatus.STREAMING;

  const handleLongPress = useCallback(() => {
    const actions: { label: string; action: () => void; destructive?: boolean }[] = [];
    if (onCopy && rawContent) actions.push({ label: "Copy", action: () => onCopy(rawContent) });
    if (!isUser && onRegenerate) actions.push({ label: "Regenerate", action: () => onRegenerate(message.id) });
    if (!isUser && onTTS && rawContent) actions.push({ label: "Read Aloud", action: () => onTTS(rawContent) });
    if (onShare && rawContent) actions.push({ label: "Share", action: () => onShare(rawContent) });
    if (onDelete) actions.push({ label: "Delete", action: () => onDelete(message.id), destructive: true });
    if (actions.length === 0) return;

    if (Platform.OS === "ios") {
      const labels = [...actions.map((a) => a.label), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        },
        (idx) => { if (idx < actions.length) actions[idx].action(); },
      );
    } else {
      // Android: use first action (copy) as default long-press behavior
      actions[0]?.action();
    }
  }, [isUser, rawContent, message.id, onCopy, onRegenerate, onDelete, onTTS, onShare]);

  if (isUser) {
    return (
      <View className="mb-6 flex-row-reverse items-start gap-3 px-4">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Ionicons name="person" size={20} color="#fff" />
        </View>
        <View className="flex-1 flex-col items-end gap-1">
          <View className="mr-1 flex-row items-center gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-text-hint">
              {labelYou}
            </Text>
            <Text className="text-[10px] text-text-hint/60">{formatTime(message.createdAt)}</Text>
          </View>
          {message.images && message.images.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 max-w-[80%]">
              {message.images.map((uri, idx) => (
                <Image
                  key={idx}
                  source={{ uri }}
                  className="h-32 w-32 rounded-xl"
                  contentFit="cover"
                  recyclingKey={`user-img-${idx}`}
                  transition={200}
                />
              ))}
            </View>
          )}
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={400}
          >
            <View
              className="max-w-[80%] rounded-2xl bg-primary px-4 py-3"
              style={{ borderTopRightRadius: 0 }}
            >
              <Text className="text-[15px] leading-relaxed text-white">
                {markdownContent || (message.images?.length ? "📷" : "")}
              </Text>
            </View>
          </Pressable>
          {/* User action bar */}
          <View className="mr-1 flex-row items-center gap-0.5">
            {onCopy && <ActionButton icon="copy-outline" onPress={() => onCopy(rawContent)} />}
            {onDelete && <ActionButton icon="trash-outline" onPress={() => onDelete(message.id)} color={colors.danger} />}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-6 flex-row items-start gap-3 px-4">
      <View className="h-9 w-9 overflow-hidden rounded-full">
        <ModelAvatar name={message.senderName ?? "AI"} size="sm" />
      </View>
      <View className="flex-1 flex-col gap-1">
        <View className="ml-1 flex-row items-center gap-2">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-text-hint">
            {message.senderName}
          </Text>
          <Text className="text-[10px] text-text-hint/60">{formatTime(message.createdAt)}</Text>
        </View>

        {reasoningContent && (
          <Pressable
            onPress={() => setShowReasoning(!showReasoning)}
            className="max-w-[90%] flex-row items-center justify-between rounded-xl bg-bg-input/50 px-3 py-2.5 active:opacity-70"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="bulb-outline" size={16} color={colors.textSecondary} />
              <Text className="text-[13px] font-medium text-text-muted">
                {labelThoughtProcess}
              </Text>
              {message.reasoningDuration && (
                <View className="rounded bg-bg-card/80 px-1.5 py-0.5">
                  <Text className="text-[11px] font-mono text-primary">
                    {message.reasoningDuration}s
                  </Text>
                </View>
              )}
            </View>
            <Ionicons
              name={showReasoning ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.searchIcon}
            />
          </Pressable>
        )}

        {showReasoning && reasoningContent && (
          <View className="max-w-[90%] rounded-xl bg-bg-hover p-3">
            {renderMarkdown
              ? <MarkdownRenderer content={reasoningContent} />
              : <Text className="text-[13px] leading-relaxed text-text-muted" textBreakStrategy="simple">{reasoningContent}</Text>}
          </View>
        )}

        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
          className="max-w-[90%] rounded-2xl bg-bubble-ai px-4 py-3"
          style={{ borderTopLeftRadius: 0 }}
        >
          {isStreaming && !rawContent && !message.generatedImages?.length ? (
            <View className="flex-row items-center gap-1.5 py-1">
              {[0, 1, 2].map((i) => (
                <MotiView
                  key={i}
                  from={{ opacity: 0.3, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    type: "timing",
                    duration: 500,
                    delay: i * 150,
                    loop: true,
                  }}
                  style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#9ca3af" }}
                />
              ))}
            </View>
          ) : (
            <>
              {displayContent ? (
                renderMarkdown
                  ? <MarkdownRenderer content={displayContent} />
                  : <Text className="text-[15px] leading-relaxed text-text-main" textBreakStrategy="simple">{displayContent}</Text>
              ) : null}
              {message.generatedImages && message.generatedImages.length > 0 && (
                <View className={`flex-row flex-wrap gap-2 ${markdownContent ? "mt-3" : ""}`}>
                  {message.generatedImages.map((uri, idx) => (
                    <Image
                      key={idx}
                      source={{ uri }}
                      className="rounded-xl"
                      style={{ width: 240, height: 240 }}
                      contentFit="cover"
                      recyclingKey={`gen-img-${idx}`}
                      transition={200}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </Pressable>

        {message.toolCalls.length > 0 && (
          <View className="max-w-[90%] gap-1.5">
            {message.toolCalls.map((tc) => {
              const result = message.toolResults.find((r) => r.toolCallId === tc.id);
              const isExpanded = expandedTools.has(tc.id);
              return (
                <Pressable
                  key={tc.id}
                  onPress={() => {
                    setExpandedTools((prev) => {
                      const next = new Set(prev);
                      next.has(tc.id) ? next.delete(tc.id) : next.add(tc.id);
                      return next;
                    });
                  }}
                  className="rounded-xl bg-bg-card overflow-hidden active:opacity-70"
                >
                  <View className="flex-row items-center gap-2 px-3 py-2">
                    <View className={`h-5 w-5 items-center justify-center rounded-md ${result ? "bg-emerald-100" : "bg-amber-100"}`}>
                      <Ionicons
                        name={result ? "checkmark" : "hourglass-outline"}
                        size={12}
                        color={result ? "#059669" : "#d97706"}
                      />
                    </View>
                    <Text className="flex-1 text-xs font-semibold text-text-main" numberOfLines={1}>
                      {tc.name}
                    </Text>
                    {result && (
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={colors.searchIcon}
                      />
                    )}
                  </View>
                  {isExpanded && result && (
                    <View className="border-t border-border-subtle bg-bg-hover px-3 py-2">
                      <Text className="text-[11px] leading-relaxed text-text-muted" numberOfLines={20}>
                        {result.content.slice(0, 1000)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Assistant action bar — hidden during streaming */}
        {!isStreaming && (
          <View className="ml-1 flex-row items-center gap-0.5">
            {onCopy && <ActionButton icon="copy-outline" onPress={() => onCopy(rawContent)} />}
            {onRegenerate && <ActionButton icon="refresh-outline" onPress={() => onRegenerate(message.id)} />}
            {onTTS && rawContent && <ActionButton icon="volume-medium-outline" onPress={() => onTTS(rawContent)} />}
            {onShare && rawContent && <ActionButton icon="share-outline" onPress={() => onShare(rawContent)} />}
            {onDelete && <ActionButton icon="trash-outline" onPress={() => onDelete(message.id)} color={colors.danger} />}
            {message.tokenUsage && (
              <View className="ml-2 flex-row items-center gap-1 rounded bg-bg-input px-1.5 py-0.5">
                <Ionicons name="analytics-outline" size={11} color={colors.searchIcon} />
                <Text className="text-[10px] font-mono text-text-hint">
                  {formatTokens(message.tokenUsage.inputTokens)}→{formatTokens(message.tokenUsage.outputTokens)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}, (prev: MessageBubbleProps, next: MessageBubbleProps) => {
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.status !== next.message.status) return false;
  if (prev.message.reasoningContent !== next.message.reasoningContent) return false;
  if (prev.message.toolCalls.length !== next.message.toolCalls.length) return false;
  if (prev.message.generatedImages?.length !== next.message.generatedImages?.length) return false;
  if (prev.message.tokenUsage !== next.message.tokenUsage) return false;
  if (prev.blocks !== next.blocks) return false;
  if (prev.isGroup !== next.isGroup) return false;
  if (prev.renderMarkdown !== next.renderMarkdown) return false;
  if (prev.labelYou !== next.labelYou) return false;
  if (prev.labelThoughtProcess !== next.labelThoughtProcess) return false;
  return true;
});

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const timeCache = new Map<string, string>();
function formatTime(iso: string): string {
  let cached = timeCache.get(iso);
  if (cached) return cached;
  const d = new Date(iso);
  cached = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase();
  timeCache.set(iso, cached);
  if (timeCache.size > 500) {
    const first = timeCache.keys().next().value;
    if (first) timeCache.delete(first);
  }
  return cached;
}
