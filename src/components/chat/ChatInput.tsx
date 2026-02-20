import React, { useState, useRef, useCallback, useEffect } from "react";
import { View, TextInput, Pressable, Text, Alert, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useAudioRecorder, RecordingPresets, AudioModule } from "expo-audio";
import { ModelAvatar } from "../common/ModelAvatar";
import type { ConversationParticipant } from "../../types";
import { useProviderStore } from "../../stores/provider-store";
import { extractMentionedModelIds } from "../../utils/mention-parser";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { ApiClient } from "../../services/api-client";

interface ChatInputProps {
  onSend: (text: string, mentionedModelIds?: string[], images?: string[]) => void;
  isGenerating: boolean;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
}

export const ChatInput = React.memo(function ChatInput({
  onSend,
  isGenerating,
  isGroup = false,
  participants = [],
}: ChatInputProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "ios" ? insets.bottom : Math.max(insets.bottom, 24);
  const [text, setText] = useState("");
  const [attachedImages, setAttachedImages] = useState<{ uri: string; base64: string }[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const getModelById = useProviderStore((s) => s.getModelById);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const handleMicPressRef = useRef<(() => void) | null>(null);

  // Check if any participant model supports vision
  const supportsVision = participants.length > 0
    ? participants.some((p) => {
        const m = getModelById(p.modelId);
        return m?.capabilities.vision !== false;
      })
    : true; // default to true if no participants info

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

  const handleMicPress = useCallback(async () => {
    if (isTranscribing) return;

    if (isRecording) {
      // Stop recording and transcribe
      await recorder.stop();
      setIsRecording(false);

      const uri = recorder.uri;
      if (!uri) return;

      setIsTranscribing(true);
      try {
        const { sttBaseUrl, sttApiKey, sttModel } = useSettingsStore.getState().settings;
        if (!sttApiKey) {
          Alert.alert(t("common.error"), t("chat.noSttProvider"));
          return;
        }

        const client = new ApiClient({
          id: "stt",
          name: "STT",
          type: "openai",
          baseUrl: sttBaseUrl,
          apiKey: sttApiKey,
          enabled: true,
          status: "connected",
          createdAt: "",
          customHeaders: [],
        });
        const transcribedText = await client.transcribeAudio(uri, undefined, sttModel);
        if (transcribedText) {
          setText((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
          inputRef.current?.focus();
        }
      } catch (err) {
        Alert.alert(t("common.error"), err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setIsTranscribing(false);
      }
    } else {
      // Start recording
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert(t("common.error"), t("chat.micPermissionDenied"));
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    }
  }, [isRecording, isTranscribing, recorder, t]);

  handleMicPressRef.current = handleMicPress;

  // Recording timer + 60s auto-stop
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setRecordingDuration((d) => {
        if (d >= 59) {
          handleMicPressRef.current?.();
          return 0;
        }
        return d + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const quickPromptEnabled = useSettingsStore((s) => s.settings.quickPromptEnabled);
  const hasMessages = useChatStore((s) => s.messages.length > 0 || !!s.streamingMessage);
  const showQuickPrompts = quickPromptEnabled && hasMessages && !text.trim() && attachedImages.length === 0 && !isGenerating && !isRecording;

  const quickPrompts = [
    { label: t("quickPrompt.continue"), prompt: t("quickPrompt.continuePrompt") },
    { label: t("quickPrompt.explain"), prompt: t("quickPrompt.explainPrompt") },
    { label: t("quickPrompt.translate"), prompt: t("quickPrompt.translatePrompt") },
    { label: t("quickPrompt.summarize"), prompt: t("quickPrompt.summarizePrompt") },
    { label: t("quickPrompt.detail"), prompt: t("quickPrompt.detailPrompt") },
    { label: t("quickPrompt.proscons"), prompt: t("quickPrompt.prosconsPrompt") },
  ];

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
              <Image source={{ uri: img.uri }} className="h-16 w-16 rounded-lg" contentFit="cover" transition={150} />
              <Pressable
                onPress={() => removeImage(idx)}
                className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60"
                hitSlop={12}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {showQuickPrompts && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-slate-100 bg-slate-50/50 px-3 py-2"
          contentContainerStyle={{ gap: 8 }}
        >
          {quickPrompts.map((qp) => (
            <Pressable
              key={qp.label}
              onPress={() => onSend(qp.prompt)}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5"
            >
              <Text className="text-[13px] font-medium text-slate-600">{qp.label}</Text>
            </Pressable>
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
        {supportsVision && (
          <Pressable onPress={handleAttach} className="text-primary p-2">
            <Ionicons name="image-outline" size={22} color="#007AFF" />
          </Pressable>
        )}
        {isGroup && (
          <Pressable onPress={toggleMentionPicker} className="p-2">
            <Ionicons name="at" size={22} color={showMentionPicker ? "#007AFF" : "#8E8E93"} />
          </Pressable>
        )}

        {isRecording ? (
          <View className="flex-1 flex-row items-center justify-center rounded-3xl border border-red-200 bg-red-50 px-4 py-1.5 min-h-[36px]">
            <View className="mr-2 h-2 w-2 rounded-full bg-red-500" />
            <Text className="text-base font-semibold text-red-600">
              {`${Math.floor(recordingDuration / 60).toString().padStart(2, "0")}:${(recordingDuration % 60).toString().padStart(2, "0")}`}
            </Text>
            <Text className="ml-2 text-xs text-red-400">/01:00</Text>
          </View>
        ) : (
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
        )}

        {isGenerating ? (
          <Pressable
            onPress={() => useChatStore.getState().stopGeneration()}
            className="h-10 w-10 items-center justify-center rounded-full bg-red-500"
          >
            <Ionicons name="stop" size={16} color="#fff" />
          </Pressable>
        ) : isTranscribing ? (
          <View className="h-10 w-10 items-center justify-center">
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        ) : text.trim() || attachedImages.length > 0 ? (
          <Pressable
            onPress={handleSend}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary"
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleMicPress}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              isRecording ? "bg-red-500" : "bg-slate-200"
            }`}
          >
            <Ionicons
              name={isRecording ? "stop" : "mic"}
              size={isRecording ? 14 : 18}
              color={isRecording ? "#fff" : "#64748b"}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
});
