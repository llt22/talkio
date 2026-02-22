import React, { useState, useRef, useCallback, useEffect } from "react";
import { View, TextInput, Pressable, Text, Alert, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useAudioRecorder, RecordingPresets, AudioModule } from "expo-audio";
import { saveImageToFile, fileToDataUri } from "../../utils/image-storage";
import { ModelAvatar } from "../common/ModelAvatar";
import type { ConversationParticipant } from "../../types";
import { useProviderStore } from "../../stores/provider-store";
import { extractMentionedModelIds } from "../../utils/mention-parser";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useThemeColors } from "../../hooks/useThemeColors";
import { ApiClient } from "../../services/api-client";

interface ChatInputProps {
  onSend: (text: string, mentionedModelIds?: string[], images?: string[]) => void;
  isGenerating: boolean;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
  hasMessages?: boolean;
  onStartAutoDiscuss?: (rounds: number, topicText?: string) => void;
  onStopAutoDiscuss?: () => void;
  autoDiscussRemaining?: number;
  autoDiscussTotalRounds?: number;
  modelName?: string;
  onSwitchModel?: () => void;
}

export const ChatInput = React.memo(function ChatInput({
  onSend,
  isGenerating,
  isGroup = false,
  participants = [],
  hasMessages = false,
  onStartAutoDiscuss,
  onStopAutoDiscuss,
  autoDiscussRemaining = 0,
  autoDiscussTotalRounds = 0,
  modelName,
  onSwitchModel,
}: ChatInputProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const bottomPad = Platform.OS === "ios" ? insets.bottom : insets.bottom + 10;
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
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  const isAutoDiscussing = autoDiscussRemaining > 0;

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
          const savedUri = await saveImageToFile(`data:${mime};base64,${b64}`);
          newImages.push({ uri: asset.uri, base64: savedUri });
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

    // Images are stored as file URIs; pass them directly (chat-service will convert to data URI for API)
    const imageUris = hasImages ? attachedImages.map((img) => img.base64) : undefined;
    onSend(trimmed || "", mentionedIds, imageUris);
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

  const handleTextChange = (value: string) => {
    setText(value);
    if (isGroup && value.endsWith("@")) {
      setShowMentionPicker(true);
    } else if (showMentionPicker && !value.includes("@")) {
      setShowMentionPicker(false);
    }
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
      className="border-t border-border-light bg-bg-light"
      style={{ paddingBottom: bottomPad }}
    >
      {attachedImages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-2">
          {attachedImages.map((img, idx) => (
            <View key={idx} className="mr-2 relative">
              <Image source={{ uri: img.uri }} className="h-16 w-16 rounded-lg" contentFit="cover" transition={150} />
              <Pressable
                onPress={() => removeImage(idx)}
                className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60 active:opacity-60"
                hitSlop={12}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Auto-discuss round picker */}
      {showRoundPicker && !isAutoDiscussing && (
        <View className="px-4 py-3">
          <Text className="mb-3 text-[13px] text-text-muted">{t("chat.autoDiscussHint")}</Text>
          <View className="flex-row gap-2.5">
            {[3, 5, 10].map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  setShowRoundPicker(false);
                  if (!hasMessages) {
                    const trimmed = text.trim();
                    if (!trimmed) {
                      inputRef.current?.focus();
                      return;
                    }
                    setText("");
                    onStartAutoDiscuss?.(n, trimmed);
                  } else {
                    onStartAutoDiscuss?.(n);
                  }
                }}
                className="flex-1 items-center rounded-2xl border border-border-light bg-bg-secondary py-3 active:bg-bg-hover"
              >
                <Text className="text-[18px] font-bold text-primary">{n}</Text>
                <Text className="mt-0.5 text-[11px] text-text-hint">{t("chat.autoDiscussRounds", { count: n })}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {showMentionPicker && isGroup && (
        <View className="border-b border-border-light bg-bg-hover px-4 py-3">
          <Text className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-hint">
            {t("chat.selectModel")}
          </Text>
          {participants.map((p) => {
            const model = getModelById(p.modelId);
            if (!model) return null;
            return (
              <Pressable
                key={p.modelId}
                onPress={() => insertMention(p.modelId)}
                className="flex-row items-center gap-3 py-2.5 active:opacity-60"
              >
                <View className="h-8 w-8 overflow-hidden rounded-lg">
                  <ModelAvatar name={model.displayName} size="sm" />
                </View>
                <Text className="text-[15px] font-medium text-text-main">
                  {model.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── Auto-discuss control panel (replaces input when hosting) ── */}
      {isAutoDiscussing ? (
        <View className="px-4 pt-3 pb-2">
          <View className="rounded-2xl bg-primary/8 px-4 py-4">
            {/* Progress info */}
            <View className="flex-row items-center justify-center mb-3">
              <MotiView
                from={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 800, loop: true }}
              >
                <Ionicons name="chatbubbles" size={20} color={colors.accent} />
              </MotiView>
              <Text className="ml-2 text-[15px] font-semibold text-primary">
                {t("chat.autoDiscussRunning")}
              </Text>
            </View>

            {/* Progress bar */}
            <View className="mb-3.5 rounded-full h-1.5 overflow-hidden bg-primary/15">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${((autoDiscussTotalRounds - autoDiscussRemaining + 1) / autoDiscussTotalRounds) * 100}%` }}
              />
            </View>

            <Text className="text-center text-[13px] text-text-muted mb-4">
              {t("chat.autoDiscussProgress", { current: autoDiscussTotalRounds - autoDiscussRemaining + 1, total: autoDiscussTotalRounds })}
            </Text>

            {/* Stop button */}
            <Pressable
              onPress={onStopAutoDiscuss}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-bg-card py-3 active:bg-bg-hover"
              style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
            >
              <View className="h-5 w-5 items-center justify-center rounded-full bg-error">
                <Ionicons name="stop" size={10} color="#fff" />
              </View>
              <Text className="text-[14px] font-semibold text-error">{t("chat.autoDiscussStop")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {/* Row 1: Input area */}
          <View className="px-4 pt-2.5 pb-1.5">
            {isRecording ? (
              <View className="flex-row items-center justify-center rounded-2xl border border-error/20 bg-error/8 px-4 py-2.5 min-h-[44px]">
                <View className="mr-2 h-2 w-2 rounded-full bg-error" />
                <Text className="text-base font-semibold text-error">
                  {`${Math.floor(recordingDuration / 60).toString().padStart(2, "0")}:${(recordingDuration % 60).toString().padStart(2, "0")}`}
                </Text>
                <Text className="ml-2 text-xs text-error/60">/01:00</Text>
              </View>
            ) : (
              <View className="flex-row items-end rounded-2xl border border-border-light/50 bg-bg-input px-3">
                <TextInput
                  ref={inputRef}
                  className="max-h-24 min-h-[44px] flex-1 text-[16px] text-text-main py-2.5"
                  placeholder={isGroup ? t("chat.messageGroup") : t("chat.message")}
                  placeholderTextColor={colors.textHint}
                  value={text}
                  onChangeText={handleTextChange}
                  multiline
                  editable={!isGenerating}
                />
                {(text.trim() || attachedImages.length > 0) && !isGenerating && (
                  <Pressable
                    onPress={handleSend}
                    className="mb-1.5 ml-1.5 h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-70"
                  >
                    <Ionicons name="arrow-up" size={18} color="#fff" />
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Row 2: Action bar */}
          <View className="flex-row items-center px-3 pb-1 gap-0.5">
            {/* Image attach */}
            {supportsVision && (
              <Pressable
                onPress={handleAttach}
                className="h-10 w-10 items-center justify-center rounded-full active:bg-bg-hover"
                disabled={isGenerating}
              >
                <Ionicons name="image-outline" size={22} color={isGenerating ? colors.textHint : colors.textSecondary} />
              </Pressable>
            )}

            {/* Model switch (single chat only) */}
            {!isGroup && modelName && onSwitchModel && (
              <Pressable
                onPress={onSwitchModel}
                className="flex-row items-center gap-1.5 rounded-full px-3 py-2 ml-0.5 active:bg-bg-hover"
                disabled={isGenerating}
              >
                <Ionicons name="swap-horizontal-outline" size={16} color={isGenerating ? colors.textHint : colors.textSecondary} />
                <Text className="text-[13px] font-medium" style={{ color: isGenerating ? colors.textHint : colors.textSecondary }} numberOfLines={1}>
                  {modelName}
                </Text>
              </Pressable>
            )}

            {/* Auto-discuss trigger (group only) */}
            {isGroup && (
              <Pressable
                onPress={() => setShowRoundPicker((v) => !v)}
                className="flex-row items-center gap-1.5 rounded-full px-3 py-2 ml-0.5 active:bg-bg-hover"
                disabled={isGenerating}
              >
                <Ionicons name="chatbubbles-outline" size={20} color={isGenerating ? colors.textHint : colors.textSecondary} />
                <Text className="text-[13px] font-medium" style={{ color: isGenerating ? colors.textHint : colors.textSecondary }}>
                  {t("chat.autoDiscuss")}
                </Text>
              </Pressable>
            )}

            <View className="flex-1" />

            {/* Voice / Stop / Transcribing */}
            {isGenerating ? (
              <Pressable
                onPress={() => useChatStore.getState().stopGeneration()}
                className="h-10 w-10 items-center justify-center rounded-full bg-error active:opacity-70"
              >
                <Ionicons name="stop" size={14} color="#fff" />
              </Pressable>
            ) : isTranscribing ? (
              <View className="h-10 w-10 items-center justify-center">
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <Pressable
                onPress={handleMicPress}
                className={`h-10 w-10 items-center justify-center rounded-full active:opacity-70 ${
                  isRecording ? "bg-error" : "active:bg-bg-hover"
                }`}
              >
                <Ionicons
                  name={isRecording ? "stop" : "mic-outline"}
                  size={isRecording ? 14 : 22}
                  color={isRecording ? "#fff" : colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
});
