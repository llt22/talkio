import React, { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { ModelAvatar } from "../common/ModelAvatar";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";
import type { Message } from "../../types";
import { useChatStore } from "../../stores/chat-store";

interface MessageBubbleProps {
  message: Message;
  isGroup?: boolean;
  isLastAssistant?: boolean;
  renderMarkdown?: boolean;
  onLongPress?: (message: Message) => void;
  onBranch?: (messageId: string) => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isGroup = false,
  isLastAssistant = false,
  renderMarkdown = true,
  onLongPress,
  onBranch,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [showReasoning, setShowReasoning] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const isUser = message.role === "user";

  const markdownContent = isUser ? message.content : message.content.trimEnd();
  const shouldRenderMarkdown = renderMarkdown && !message.isStreaming;

  // P3: Skip entrance animation for settled (non-streaming) messages
  const Wrapper = message.isStreaming ? MotiView : View;
  const wrapperAnimProps = message.isStreaming
    ? { from: { opacity: 0, translateY: 8 }, animate: { opacity: 1, translateY: 0 }, transition: { type: "timing" as const, duration: 250 } }
    : {};

  if (isUser) {
    return (
      <View
        className="mb-6 flex-row-reverse items-start gap-3 px-4"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Ionicons name="person" size={20} color="#fff" />
        </View>
        <View className="flex-1 flex-col items-end gap-1">
          <View className="mr-1 flex-row items-center gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t("chat.you")}
            </Text>
            <Text className="text-[10px] text-slate-300">{formatTime(message.createdAt)}</Text>
          </View>
          {message.images && message.images.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 max-w-[80%]">
              {message.images.map((uri, idx) => (
                <Image
                  key={idx}
                  source={{ uri }}
                  className="h-32 w-32 rounded-xl"
                  resizeMode="cover"
                />
              ))}
            </View>
          )}
          <Pressable
            onLongPress={() => onLongPress?.(message)}
            className="max-w-[80%] rounded-2xl bg-primary px-4 py-3"
            style={{ borderTopRightRadius: 0 }}
          >
            <Text className="text-[15px] leading-relaxed text-white">
              {markdownContent || (message.images?.length ? "📷" : "")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Wrapper
      {...wrapperAnimProps}
      className="mb-6 flex-row items-start gap-3 px-4"
    >
      <View className="h-9 w-9 overflow-hidden rounded-full">
        <ModelAvatar name={message.senderName ?? "AI"} size="sm" />
      </View>
      <View className="flex-1 flex-col gap-1">
        <View className="ml-1 flex-row items-center gap-2">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {message.senderName}
          </Text>
          <Text className="text-[10px] text-slate-300">{formatTime(message.createdAt)}</Text>
        </View>

        {message.reasoningContent && (
          <Pressable
            onPress={() => setShowReasoning(!showReasoning)}
            className="max-w-[90%] flex-row items-center justify-between rounded-xl bg-slate-200/50 px-3 py-2.5"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="bulb-outline" size={16} color="#6b7280" />
              <Text className="text-[13px] font-medium text-slate-600">
                {t("chat.thoughtProcess")}
              </Text>
              {message.reasoningDuration && (
                <View className="rounded bg-white/80 px-1.5 py-0.5">
                  <Text className="text-[11px] font-mono text-primary">
                    {message.reasoningDuration}s
                  </Text>
                </View>
              )}
            </View>
            <Ionicons
              name={showReasoning ? "chevron-up" : "chevron-down"}
              size={16}
              color="#9ca3af"
            />
          </Pressable>
        )}

        {showReasoning && message.reasoningContent && (
          <View className="max-w-[90%] rounded-xl bg-slate-50 p-3">
            {shouldRenderMarkdown
              ? <MarkdownRenderer content={message.reasoningContent} />
              : <Text className="text-[13px] leading-relaxed text-slate-600">{message.reasoningContent}</Text>}
          </View>
        )}

        <Pressable
          onLongPress={() => onLongPress?.(message)}
          className="max-w-[90%] rounded-2xl border border-slate-100 bg-[#F2F2F7] px-4 py-3"
          style={{ borderTopLeftRadius: 0 }}
        >
          {message.isStreaming && !message.content && !message.generatedImages?.length ? (
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
              {markdownContent ? (
                // P2: Use plain Text during streaming, switch to Markdown after done
                message.isStreaming || !shouldRenderMarkdown
                  ? <Text className="text-[15px] leading-relaxed text-gray-800">{markdownContent}</Text>
                  : <MarkdownRenderer content={markdownContent} />
              ) : null}
              {message.generatedImages && message.generatedImages.length > 0 && (
                <View className={`flex-row flex-wrap gap-2 ${markdownContent ? "mt-3" : ""}`}>
                  {message.generatedImages.map((uri, idx) => (
                    <Image
                      key={idx}
                      source={{ uri }}
                      className="rounded-xl"
                      style={{ width: 240, height: 240 }}
                      resizeMode="cover"
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
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  <View className="flex-row items-center gap-2 px-3 py-2">
                    <View className={`h-5 w-5 items-center justify-center rounded-md ${result ? "bg-emerald-100" : "bg-amber-100"}`}>
                      <Ionicons
                        name={result ? "checkmark" : "hourglass-outline"}
                        size={12}
                        color={result ? "#059669" : "#d97706"}
                      />
                    </View>
                    <Text className="flex-1 text-xs font-semibold text-slate-700" numberOfLines={1}>
                      {tc.name}
                    </Text>
                    {result && (
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={14}
                        color="#9ca3af"
                      />
                    )}
                  </View>
                  {isExpanded && result && (
                    <View className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                      <Text className="text-[11px] leading-relaxed text-slate-600" numberOfLines={20}>
                        {result.content.slice(0, 1000)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {isLastAssistant && !message.isStreaming && (
          <View className="ml-1 flex-row items-center gap-1">
            <Pressable
              onPress={() => {
                useChatStore.getState().regenerateMessage(message.id);
              }}
              className="self-start rounded-md p-2"
              hitSlop={10}
            >
              <Ionicons name="refresh-outline" size={16} color="#9ca3af" />
            </Pressable>
            {onBranch && (
              <Pressable
                onPress={() => onBranch(message.id)}
                className="self-start p-2"
                hitSlop={10}
              >
                <Ionicons name="git-branch-outline" size={16} color="#9ca3af" />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Wrapper>
  );
}, (prev: MessageBubbleProps, next: MessageBubbleProps) => {
  // Only re-render when these change
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.isStreaming !== next.message.isStreaming) return false;
  if (prev.message.reasoningContent !== next.message.reasoningContent) return false;
  if (prev.message.toolCalls.length !== next.message.toolCalls.length) return false;
  if (prev.message.generatedImages?.length !== next.message.generatedImages?.length) return false;
  if (prev.isLastAssistant !== next.isLastAssistant) return false;
  if (prev.isGroup !== next.isGroup) return false;
  return true;
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase();
}
