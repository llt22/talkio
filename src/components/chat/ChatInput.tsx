import { useState, useRef } from "react";
import { View, TextInput, Pressable, Text, Alert, Platform, Image, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ModelAvatar } from "../common/ModelAvatar";
import type { ConversationParticipant } from "../../types";
import { useProviderStore } from "../../stores/provider-store";
import { extractMentionedModelIds } from "../../utils/mention-parser";
import { useChatStore } from "../../stores/chat-store";

interface ChatInputProps {
  onSend: (text: string, mentionedModelIds?: string[], images?: string[]) => void;
  isGenerating: boolean;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
}

export function ChatInput({
  onSend,
  isGenerating,
  isGroup = false,
  participants = [],
}: ChatInputProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "ios" ? insets.bottom : insets.bottom + 10;
  const [text, setText] = useState("");
  const [attachedImages, setAttachedImages] = useState<{ uri: string; base64: string }[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const getModelById = useProviderStore((s) => s.getModelById);

  const handleAttach = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.error"), t("chat.photoPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newImages: { uri: string; base64: string }[] = [];
      for (const asset of result.assets) {
        try {
          const b64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const mime = asset.mimeType || "image/jpeg";
          newImages.push({ uri: asset.uri, base64: `data:${mime};base64,${b64}` });
        } catch {
          // skip unreadable files
        }
      }
      setAttachedImages((prev) => [...prev, ...newImages].slice(0, 4));
    }
  };

  const removeImage = (idx: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = () => {
    const trimmed = text.trim();
    const hasImages = attachedImages.length > 0;
    if ((!trimmed && !hasImages) || isGenerating) return;

    let mentionedIds: string[] | undefined;
    if (isGroup) {
      const modelNames = new Map<string, string>();
      for (const p of participants) {
        const model = getModelById(p.modelId);
        if (model) modelNames.set(p.modelId, model.displayName);
      }
      const ids = extractMentionedModelIds(trimmed, modelNames);
      if (ids.length > 0) mentionedIds = ids;
    }

    const imageDataUris = hasImages ? attachedImages.map((img) => img.base64) : undefined;
    onSend(trimmed || "", mentionedIds, imageDataUris);
    setText("");
    setAttachedImages([]);
    inputRef.current?.focus();
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (isGroup && value.endsWith("@")) {
      setShowMentionPicker(true);
    } else if (showMentionPicker && !value.includes("@")) {
      setShowMentionPicker(false);
    }
  };

  const toggleMentionPicker = () => {
    setShowMentionPicker((v) => !v);
  };

  const insertMention = (modelId: string) => {
    const model = getModelById(modelId);
    if (model) {
      const mentionTag = model.displayName.replace(/\s+/g, "");
      setText((prev) => {
        // Remove trailing @ if user typed it to trigger the picker
        const base = prev.endsWith("@") ? prev.slice(0, -1) : prev;
        const sep = base.length > 0 && !base.endsWith(" ") ? " " : "";
        return `${base}${sep}@${mentionTag} `;
      });
    }
    setShowMentionPicker(false);
    inputRef.current?.focus();
  };

  return (
    <View
      className="border-t border-slate-100 bg-white"
      style={{ paddingBottom: bottomPad }}
    >
      {attachedImages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-2">
          {attachedImages.map((img, idx) => (
            <View key={idx} className="mr-2 relative">
              <Image source={{ uri: img.uri }} className="h-16 w-16 rounded-lg" />
              <Pressable
                onPress={() => removeImage(idx)}
                className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60"
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {showMentionPicker && isGroup && (
        <View className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <Text className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {t("chat.selectModel")}
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
        <Pressable onPress={handleAttach} className="text-primary p-1">
          <Ionicons name="add" size={24} color="#007AFF" />
        </Pressable>
        {isGroup && (
          <Pressable onPress={toggleMentionPicker} className="p-1">
            <Ionicons name="at" size={22} color={showMentionPicker ? "#007AFF" : "#8E8E93"} />
          </Pressable>
        )}

        <View className="flex-1 flex-row items-center rounded-3xl border border-slate-200/50 bg-[#F2F2F7] px-4 py-1.5">
          <TextInput
            ref={inputRef}
            className="max-h-24 min-h-[36px] flex-1 text-[16px] text-text-main"
            placeholder={isGroup ? t("chat.messageGroup") : t("chat.message")}
            placeholderTextColor="#8E8E93"
            value={text}
            onChangeText={handleTextChange}
            multiline
            editable={!isGenerating}
          />
        </View>

        {isGenerating ? (
          <Pressable
            onPress={() => useChatStore.getState().stopGeneration()}
            className="h-8 w-8 items-center justify-center rounded-full bg-red-500"
          >
            <Ionicons name="stop" size={16} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() && attachedImages.length === 0}
            className={`h-8 w-8 items-center justify-center rounded-full ${
              text.trim() || attachedImages.length > 0 ? "bg-primary" : "bg-slate-200"
            }`}
          >
            <Ionicons
              name="arrow-up"
              size={18}
              color={text.trim() || attachedImages.length > 0 ? "#fff" : "#9ca3af"}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
