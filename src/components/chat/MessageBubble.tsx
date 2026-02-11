import { useState } from "react";
import { View, Text, Pressable } from "react-native";
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
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = message.role === "user";

  const markdownContent = isUser ? message.content : message.content.trimEnd();

  if (isUser) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 250 }}
        className="mb-4 flex-col items-end px-4"
      >
        <Pressable
          onLongPress={() => onLongPress?.(message)}
          className="max-w-[85%] rounded-2xl bg-ios-green px-4 py-3"
          style={{ borderTopRightRadius: 0 }}
        >
          <Text className="text-[15px] font-medium leading-relaxed text-ios-green-text">
            {markdownContent}
          </Text>
        </Pressable>
        <Text className="mr-1 mt-1 text-[10px] font-medium uppercase text-text-muted">
          {formatTime(message.createdAt)}
        </Text>
      </MotiView>
    );
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 250 }}
      className="mb-4 flex-col items-start px-4"
    >
      <View className="mb-2 flex-row items-center gap-2">
        <View className="h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-border-light bg-slate-100">
          <ModelAvatar name={message.senderName ?? "AI"} size="sm" />
        </View>
        <Text className="text-xs font-bold text-text-muted">
          {message.senderName}
          {message.identityId ? ` • ${message.identityId}` : ""}
        </Text>
      </View>

      {message.reasoningContent && (
        <Pressable
          onPress={() => setShowReasoning(!showReasoning)}
          className="mb-2 flex-row items-center rounded-xl bg-slate-200/50 px-3 py-2"
        >
          <Ionicons name="bulb-outline" size={14} color="#6b7280" />
          <Text className="ml-1.5 text-[13px] font-medium text-slate-600">
            {showReasoning ? "Hide thinking" : "Thought process"}
          </Text>
          <Ionicons
            name={showReasoning ? "chevron-up" : "chevron-down"}
            size={14}
            color="#9ca3af"
            style={{ marginLeft: 4 }}
          />
        </Pressable>
      )}

      {showReasoning && message.reasoningContent && (
        <View className="mb-2 rounded-xl bg-slate-50 p-3">
          <Text className="text-xs leading-5 text-slate-600">
            {message.reasoningContent}
          </Text>
        </View>
      )}

      <Pressable
        onLongPress={() => onLongPress?.(message)}
        className="max-w-[90%] rounded-2xl border border-border-light bg-white px-4 py-3"
        style={{
          borderTopLeftRadius: 0,
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
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
        <View className="mt-1 rounded-lg border border-border-light bg-gray-50 px-3 py-2">
          {message.toolCalls.map((tc) => (
            <View key={tc.id} className="flex-row items-center">
              <Ionicons name="construct-outline" size={14} color="#6b7280" />
              <Text className="ml-1.5 text-xs text-text-muted">
                Called: {tc.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View className="mt-1 ml-1 flex-row items-center">
        <Text className="text-[10px] font-medium uppercase text-text-muted">
          {formatTime(message.createdAt)}
        </Text>
        {onBranch && (
          <Pressable
            onPress={() => onBranch(message.id)}
            className="ml-2 p-1"
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
