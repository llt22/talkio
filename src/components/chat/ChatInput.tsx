import { useState, useRef } from "react";
import { View, TextInput, Pressable, ScrollView, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModelAvatar } from "../common/ModelAvatar";
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
    <View className="border-t border-slate-100 bg-white">
      {showQuickPrompts && !isGroup && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-slate-100 px-2 py-1.5"
        >
          {QUICK_PROMPTS.map((qp) => (
            <Pressable
              key={qp.label}
              onPress={() => handleQuickPrompt(qp.prompt)}
              className="mr-2 rounded-full border border-slate-200 px-3 py-1"
            >
              <Text className="text-xs text-slate-500">{qp.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {showMentionPicker && isGroup && (
        <View className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <Text className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Select Model
          </Text>
          {participants.map((p) => {
            const model = getModelById(p.modelId);
            if (!model) return null;
            return (
              <Pressable
                key={p.modelId}
                onPress={() => insertMention(p.modelId)}
                className="flex-row items-center gap-3 py-2.5"
              >
                <View className="h-8 w-8 overflow-hidden rounded-lg">
                  <ModelAvatar name={model.displayName} size="sm" />
                </View>
                <Text className="text-[15px] font-medium text-slate-700">
                  {model.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <Pressable className="text-primary p-1">
          <Ionicons name="add" size={24} color="#007AFF" />
        </Pressable>

        <View className="flex-1 flex-row items-center rounded-3xl border border-slate-200/50 bg-[#F2F2F7] px-4 py-1.5">
          {isGroup && (
            <Text className="text-primary text-[16px] font-semibold mr-0.5">@</Text>
          )}
          <TextInput
            ref={inputRef}
            className="max-h-24 min-h-[36px] flex-1 text-[16px] text-text-main"
            placeholder={isGroup ? "Message Group..." : `Message...`}
            placeholderTextColor="#8E8E93"
            value={text}
            onChangeText={handleTextChange}
            multiline
            editable={!isGenerating}
          />
        </View>

        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || isGenerating}
          className={`h-8 w-8 items-center justify-center rounded-full ${
            text.trim() && !isGenerating ? "bg-primary" : "bg-slate-200"
          }`}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={text.trim() && !isGenerating ? "#fff" : "#9ca3af"}
          />
        </Pressable>
      </View>
    </View>
  );
}
