import { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { ModelAvatar } from "../common/ModelAvatar";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";
import type { Message } from "../../types";

interface MessageBubbleProps {
  message: Message;
  isGroup?: boolean;
  onLongPress?: (message: Message) => void;
  onBranch?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isGroup = false,
  onLongPress,
  onBranch,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = message.role === "user";

  const markdownContent = isUser ? message.content : message.content.trimEnd();

  if (isUser) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 250 }}
        className="mb-6 flex-row-reverse items-start gap-3 px-4"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Ionicons name="person" size={20} color="#fff" />
        </View>
        <View className="flex-1 flex-col items-end gap-1">
          <Text className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t("chat.you")}
          </Text>
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
      </MotiView>
    );
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 250 }}
      className="mb-6 flex-row items-start gap-3 px-4"
    >
      <View className="h-9 w-9 overflow-hidden rounded-full">
        <ModelAvatar name={message.senderName ?? "AI"} size="sm" />
      </View>
      <View className="flex-1 flex-col gap-1">
        <Text className="ml-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {message.senderName}
        </Text>

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
            <MarkdownRenderer content={message.reasoningContent} />
          </View>
        )}

        <Pressable
          onLongPress={() => onLongPress?.(message)}
          className="max-w-[90%] rounded-2xl border border-slate-100 bg-[#F2F2F7] px-4 py-3"
          style={{ borderTopLeftRadius: 0 }}
        >
          {message.isStreaming && !message.content ? (
            <View className="flex-row items-center">
              <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
            </View>
          ) : (
            <MarkdownRenderer content={markdownContent} />
          )}
        </Pressable>

        {message.toolCalls.length > 0 && (
          <View className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            {message.toolCalls.map((tc) => (
              <View key={tc.id} className="flex-row items-center">
                <Ionicons name="construct-outline" size={14} color="#6b7280" />
                <Text className="ml-1.5 text-xs text-text-muted">
                  {t("chat.called", { name: tc.name })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {onBranch && (
          <Pressable
            onPress={() => onBranch(message.id)}
            className="ml-1 self-start p-1"
            hitSlop={8}
          >
            <Ionicons name="git-branch-outline" size={12} color="#9ca3af" />
          </Pressable>
        )}
      </View>
    </MotiView>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase();
}
