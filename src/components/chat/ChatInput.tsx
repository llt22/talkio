import { useState, useRef } from "react";
import { View, TextInput, Pressable, ScrollView, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QUICK_PROMPTS } from "../../constants";
import type { ConversationParticipant } from "../../types";
import { useProviderStore } from "../../stores/provider-store";

interface ChatInputProps {
  onSend: (text: string, mentionedModelIds?: string[]) => void;
  isGenerating: boolean;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
  showQuickPrompts?: boolean;
}

export function ChatInput({
  onSend,
  isGenerating,
  isGroup = false,
  participants = [],
  showQuickPrompts = true,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const getModelById = useProviderStore((s) => s.getModelById);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isGenerating) return;

    const mentionedIds: string[] = [];
    if (isGroup) {
      for (const p of participants) {
        const model = getModelById(p.modelId);
        if (model && trimmed.includes(`@${model.displayName}`)) {
          mentionedIds.push(p.modelId);
        }
      }
    }

    onSend(trimmed, mentionedIds.length > 0 ? mentionedIds : undefined);
    setText("");
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (isGroup && value.endsWith("@")) {
      setShowMentionPicker(true);
    } else {
      setShowMentionPicker(false);
    }
  };

  const insertMention = (modelId: string) => {
    const model = getModelById(modelId);
    if (model) {
      setText((prev) => prev + model.displayName + " ");
    }
    setShowMentionPicker(false);
    inputRef.current?.focus();
  };

  const handleQuickPrompt = (prompt: string) => {
    setText((prev) => (prev ? `${prompt}\n${prev}` : prompt + " "));
    inputRef.current?.focus();
  };

  return (
    <View className="border-t border-border-light bg-nav-light">
      {showQuickPrompts && !isGroup && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-border-light px-2 py-1.5"
        >
          {QUICK_PROMPTS.map((qp) => (
            <Pressable
              key={qp.label}
              onPress={() => handleQuickPrompt(qp.prompt)}
              className="mr-2 rounded-full border border-border-light px-3 py-1"
            >
              <Text className="text-xs text-text-muted">{qp.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {showMentionPicker && isGroup && (
        <View className="border-b border-border-light bg-gray-50 px-4 py-2">
          <Text className="mb-1 text-xs font-semibold uppercase text-text-muted">
            Select Model
          </Text>
          {participants.map((p) => {
            const model = getModelById(p.modelId);
            if (!model) return null;
            return (
              <Pressable
                key={p.modelId}
                onPress={() => insertMention(p.modelId)}
                className="flex-row items-center py-1.5"
              >
                <Ionicons name="flash" size={16} color="#007AFF" />
                <Text className="ml-2 text-sm font-medium text-text-main">
                  {model.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View className="flex-row items-end gap-2 px-4 py-2.5">
        <Pressable
          className="mb-0.5 h-10 w-10 items-center justify-center rounded-full border border-border-light bg-white"
          style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
        >
          <Ionicons name="add" size={24} color="#6b7280" />
        </Pressable>

        <TextInput
          ref={inputRef}
          className="max-h-24 min-h-[40px] flex-1 rounded-2xl border border-border-light bg-white px-4 py-2.5 text-[15px] text-text-main"
          style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
          placeholder={isGroup ? "@| Message Group..." : "Message..."}
          placeholderTextColor="#8E8E93"
          value={text}
          onChangeText={handleTextChange}
          multiline
          editable={!isGenerating}
        />

        <Pressable
          className="mb-0.5 h-10 w-10 items-center justify-center rounded-full border border-border-light bg-white"
          style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
        >
          <Ionicons name="mic-outline" size={24} color="#6b7280" />
        </Pressable>

        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || isGenerating}
          className={`mb-0.5 h-10 w-10 items-center justify-center rounded-full ${
            text.trim() && !isGenerating ? "bg-primary" : "bg-gray-200"
          }`}
          style={
            text.trim() && !isGenerating
              ? { shadowColor: "#007AFF", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 }
              : undefined
          }
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={text.trim() && !isGenerating ? "#fff" : "#9ca3af"}
          />
        </Pressable>
      </View>
    </View>
  );
}
