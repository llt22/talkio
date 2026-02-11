import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { Ionicons } from "@expo/vector-icons";
import { ModelAvatar } from "../common/ModelAvatar";
import type { Message } from "../../types";

const markdownStyles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22, color: "#1f2937" },
  heading1: { fontSize: 22, fontWeight: "700", color: "#111827", marginTop: 12, marginBottom: 6 },
  heading2: { fontSize: 19, fontWeight: "700", color: "#111827", marginTop: 10, marginBottom: 4 },
  heading3: { fontSize: 17, fontWeight: "600", color: "#111827", marginTop: 8, marginBottom: 4 },
  heading4: { fontSize: 15, fontWeight: "600", color: "#374151", marginTop: 6, marginBottom: 2 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 4, flexDirection: "row" },
  bullet_list_icon: { fontSize: 15, lineHeight: 22, marginRight: 6, color: "#6b7280" },
  ordered_list_icon: { fontSize: 15, lineHeight: 22, marginRight: 6, color: "#6b7280" },
  hr: { backgroundColor: "#e5e7eb", height: 1, marginVertical: 12 },
  blockquote: {
    backgroundColor: "#f9fafb",
    borderLeftWidth: 3,
    borderLeftColor: "#d1d5db",
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 6,
  },
  link: { color: "#2563eb", textDecorationLine: "underline" },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  code_inline: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#e11d48",
  },
  code_block: {
    backgroundColor: "#1f2937",
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#e5e7eb",
    marginVertical: 6,
  },
  fence: {
    backgroundColor: "#1f2937",
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#e5e7eb",
    marginVertical: 6,
  },
  table: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, marginVertical: 6 },
  thead: { backgroundColor: "#f3f4f6" },
  th: { padding: 6, fontWeight: "600", fontSize: 13 },
  td: { padding: 6, fontSize: 13, borderTopWidth: 1, borderColor: "#e5e7eb" },
});

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

  return (
    <View className={`mb-3 flex-row px-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <View className="mr-2 mt-1">
          <ModelAvatar name={message.senderName ?? "AI"} size="sm" />
        </View>
      )}

      <View className={`max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (isGroup || message.identityId) && (
          <Text className="mb-1 text-xs font-medium uppercase text-text-muted">
            {message.senderName}
            {message.identityId ? ` · ${message.identityId}` : ""}
          </Text>
        )}

        {message.reasoningContent && (
          <Pressable
            onPress={() => setShowReasoning(!showReasoning)}
            className="mb-1 flex-row items-center rounded-lg bg-amber-50 px-3 py-1.5"
          >
            <Ionicons name="bulb-outline" size={14} color="#92400e" />
            <Text className="ml-1.5 text-xs font-medium text-amber-700">
              {showReasoning ? "Hide thinking" : "Show thinking"}
            </Text>
          </Pressable>
        )}

        {showReasoning && message.reasoningContent && (
          <View className="mb-1 rounded-lg bg-amber-50 p-3">
            <Text className="text-xs leading-5 text-amber-800">
              {message.reasoningContent}
            </Text>
          </View>
        )}

        <Pressable
          onLongPress={() => onLongPress?.(message)}
          className={`rounded-2xl px-4 py-2.5 ${
            isUser ? "bg-primary" : "bg-white"
          }`}
          style={
            !isUser
              ? { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
              : undefined
          }
        >
          {isUser ? (
            <Text className="text-[15px] leading-6 text-white">
              {message.content}
            </Text>
          ) : message.isStreaming && !message.content ? (
            <View className="flex-row items-center">
              <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
            </View>
          ) : (
            <Markdown style={markdownStyles}>
              {message.content}
            </Markdown>
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

        <View className="mt-0.5 flex-row items-center">
          <Text className="text-xs text-text-hint">
            {formatTime(message.createdAt)}
          </Text>
          {onBranch && !isUser && (
            <Pressable
              onPress={() => onBranch(message.id)}
              className="ml-2 p-1"
              hitSlop={8}
            >
              <Ionicons name="git-branch-outline" size={12} color="#9ca3af" />
            </Pressable>
          )}
        </View>
      </View>

      {isUser && (
        <View className="ml-2 mt-1">
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary">
            <Ionicons name="person" size={16} color="#fff" />
          </View>
        </View>
      )}
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
