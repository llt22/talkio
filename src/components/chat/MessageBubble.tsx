import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Markdown } from "react-native-remark";
import { Ionicons } from "@expo/vector-icons";
import { ModelAvatar } from "../common/ModelAvatar";
import type { Message } from "../../types";
const mdStyles = {
  text: { fontSize: 15, lineHeight: 22, color: "#1f2937" },
  paragraph: { fontSize: 15, lineHeight: 22, color: "#1f2937", marginBottom: 8 },
  heading: (level: number) => ({
    fontSize: [22, 19, 17, 15, 14, 13][level - 1] ?? 15,
    fontWeight: (level <= 2 ? "700" : "600") as "700" | "600",
    color: "#111827",
    marginTop: 10,
    marginBottom: 4,
  }),
  strong: { fontWeight: "700" as const },
  emphasis: { fontStyle: "italic" as const },
  link: { color: "#2563eb", textDecorationLine: "underline" as const },
  inlineCode: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#e11d48",
  },
  codeBlock: {
    headerBackgroundColor: "#374151",
    contentBackgroundColor: "#1f2937",
    headerTextStyle: { color: "#9ca3af", fontSize: 12 },
    contentTextStyle: { color: "#e5e7eb", fontSize: 13, fontFamily: "monospace" },
  },
  blockquote: {
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 6,
  },
  borderColor: "#d1d5db",
  list: { marginBottom: 8 },
  listItem: { marginBottom: 4 },
  thematicBreak: { backgroundColor: "#e5e7eb", height: 1, marginVertical: 12 },
};

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
            <Markdown
              markdown={message.content}
              customStyles={mdStyles}
            />
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
