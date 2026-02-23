import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, Alert, Share, ToastAndroid, Platform, Animated } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { KeyboardAvoidingView, KeyboardController } from "react-native-keyboard-controller";
import { useTranslation } from "react-i18next";
import { LegendList } from "@legendapp/list";
import type { LegendListRef } from "@legendapp/list";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useChatStore } from "../../src/stores/chat-store";
import { useProviderStore } from "../../src/stores/provider-store";
import { useIdentityStore } from "../../src/stores/identity-store";
import { useThemeColors } from "../../src/hooks/useThemeColors";
import { useMessages } from "../../src/hooks/useMessages";
import { useConversations } from "../../src/hooks/useConversations";
import { useConversationBlocks } from "../../src/hooks/useMessageBlocks";
import { MessageBubble } from "../../src/components/chat/MessageBubble";
import { ChatInput } from "../../src/components/chat/ChatInput";
import { IdentitySlider } from "../../src/components/chat/IdentitySlider";
import { ModelPickerModal } from "../../src/components/chat/ModelPickerModal";
import type { Message } from "../../src/types";

KeyboardController.preload();

const messageKeyExtractor = (item: Message) => item.id;

export default function ChatDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const listRef = useRef<LegendListRef>(null);
  const [isExporting, setIsExporting] = useState(false);

  // DB-driven: conversations and messages come from useLiveQuery hooks
  const allConversations = useConversations();
  const conv = useMemo(() => allConversations.find((c) => c.id === id), [allConversations, id]);
  const hasLoadedRef = useRef(false);
  if (allConversations.length > 0 || conv) hasLoadedRef.current = true;
  const activeBranchId = useChatStore((s) => s.activeBranchId);
  const messages = useMessages(id ?? null, activeBranchId);
  const blocksByMessage = useConversationBlocks(id ?? null);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const autoDiscussRemaining = useChatStore((s) => s.autoDiscussRemaining);
  const autoDiscussTotalRounds = useChatStore((s) => s.autoDiscussTotalRounds);
  const startAutoDiscuss = useChatStore((s) => s.startAutoDiscuss);
  const stopAutoDiscuss = useChatStore((s) => s.stopAutoDiscuss);

  const hasMessages = messages.length > 0;
  const messageCount = messages.length;
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const updateParticipantIdentity = useChatStore((s) => s.updateParticipantIdentity);
  const updateParticipantModel = useChatStore((s) => s.updateParticipantModel);
  const addParticipant = useChatStore((s) => s.addParticipant);
  const removeParticipant = useChatStore((s) => s.removeParticipant);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const colors = useThemeColors();
  const isGroup = conv?.type === "group";
  const participants = conv?.participants;
  const prevParticipantsRef = useRef(participants);
  if (
    participants !== prevParticipantsRef.current &&
    participants &&
    prevParticipantsRef.current &&
    participants.length === prevParticipantsRef.current.length &&
    participants.every((p, i) => p.id === prevParticipantsRef.current![i].id && p.modelId === prevParticipantsRef.current![i].modelId && p.identityId === prevParticipantsRef.current![i].identityId)
  ) {
    // shallow-equal: keep previous reference to avoid downstream re-renders
  } else {
    prevParticipantsRef.current = participants;
  }
  const stableParticipants = prevParticipantsRef.current ?? [];
  const [showIdentitySlider, setShowIdentitySlider] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerMode, setModelPickerMode] = useState<"add" | "switch">("add");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showScrollToBottomRef = useRef(false);
  const scrollBtnOpacity = useRef(new Animated.Value(0)).current;

  // For single chat, use the first participant
  const currentParticipant = conv?.participants[0];
  const model = currentParticipant ? getModelById(currentParticipant.modelId) : null;
  const activeIdentity = currentParticipant?.identityId
    ? getIdentityById(currentParticipant.identityId)
    : null;

  useEffect(() => {
    if (id) {
      setCurrentConversation(id);
      return () => {
        const previousId = id;
        // Only clear if still on this conversation
        if (useChatStore.getState().currentConversationId === previousId) {
          setCurrentConversation(null);
        }
      };
    }
    return undefined;
  }, [id, setCurrentConversation]);

  const clearConversationMessages = useChatStore((s) => s.clearConversationMessages);

  const clearHistory = useCallback(() => {
    if (!id) return;
    Alert.alert(t("chat.clearHistory"), t("chat.clearHistoryConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => clearConversationMessages(id),
      },
    ]);
  }, [id, clearConversationMessages]);

  // P5: Split navigation header into two effects to reduce unnecessary updates
  const convTitle = conv?.title;
  const participantCount = conv?.participants.length ?? 0;
  const modelDisplayName = model?.displayName;
  const identityName = activeIdentity?.name;

  useLayoutEffect(() => {
    const title = isGroup
      ? convTitle ?? t("chat.group")
      : modelDisplayName ?? t("chat.chatTitle");

    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          onPress={handleHeaderPress}
          className="items-center active:opacity-60"
        >
          <Text className="text-sm font-bold tracking-tight text-text-main">{title}</Text>
          {isGroup ? (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="people-outline" size={12} color={colors.accent} />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {t("chat.modelCount", { count: participantCount })}
              </Text>
              <Ionicons name={showParticipants ? "chevron-up" : "chevron-down"} size={12} color={colors.accent} />
            </View>
          ) : (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="person-circle-outline" size={12} color={colors.accent} />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {identityName ?? t("chat.mountIdentity")}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.accent} />
            </View>
          )}
        </Pressable>
      ),
    });
  }, [convTitle, modelDisplayName, identityName, participantCount, isGroup, showParticipants]);

  // ── Scroll management (follows Cherry Studio App pattern) ──
  // LegendList's maintainScrollAtEnd handles auto-scroll during streaming.
  // We only track distance-from-bottom for the scroll-to-bottom button.
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const isAway = distanceFromBottom > 100;
    if (isAway !== showScrollToBottomRef.current) {
      showScrollToBottomRef.current = isAway;
      setShowScrollToBottom(isAway);
      Animated.spring(scrollBtnOpacity, {
        toValue: isAway ? 1 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    }
  }, [scrollBtnOpacity]);

  const handleSend = useCallback(
    (text: string, mentionedModelIds?: string[], images?: string[]) => {
      showScrollToBottomRef.current = false;
      setShowScrollToBottom(false);
      scrollBtnOpacity.setValue(0);
      sendMessage(text, mentionedModelIds, images);
    },
    [sendMessage],
  );

  const scrollToBottom = useCallback(() => {
    showScrollToBottomRef.current = false;
    setShowScrollToBottom(false);
    Animated.timing(scrollBtnOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    listRef.current?.scrollToOffset({ offset: 9999999, animated: true });
  }, [scrollBtnOpacity]);

  const handleIdentitySelect = useCallback(
    (identityId: string | null) => {
      const targetParticipantId = editingParticipantId ?? currentParticipant?.id;
      if (id && targetParticipantId) {
        updateParticipantIdentity(id, targetParticipantId, identityId);
      }
      setShowIdentitySlider(false);
      setEditingParticipantId(null);
    },
    [id, editingParticipantId, currentParticipant, updateParticipantIdentity],
  );

  const handleIdentitySliderClose = useCallback(() => {
    setShowIdentitySlider(false);
    setEditingParticipantId(null);
  }, []);

  const handleHeaderPress = useCallback(() => {
    if (isGroup) {
      setShowParticipants((v) => !v);
      setShowIdentitySlider(false);
    } else {
      setShowIdentitySlider((v) => !v);
    }
  }, [isGroup]);

  const handleAddParticipant = useCallback((modelId: string) => {
    if (id) addParticipant(id, modelId);
  }, [id, addParticipant]);

  const handleSwitchModel = useCallback(() => {
    setModelPickerMode("switch");
    setShowModelPicker(true);
  }, []);

  const handleModelPickerSelect = useCallback((modelId: string) => {
    if (!id) return;
    if (modelPickerMode === "switch" && currentParticipant) {
      updateParticipantModel(id, currentParticipant.id, modelId);
    } else {
      addParticipant(id, modelId);
    }
  }, [id, modelPickerMode, currentParticipant, updateParticipantModel, addParticipant]);

  const handleParticipantPress = useCallback((participantId: string) => {
    if (!id) return;
    setEditingParticipantId(participantId);
    setShowIdentitySlider(true);
  }, [id]);

  const handleRemoveParticipant = useCallback((participantId: string, displayName: string) => {
    if (!id) return;
    Alert.alert(t("chat.removeMember"), displayName, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeParticipant(id, participantId) },
    ]);
  }, [id, removeParticipant, t]);

  const copyMessage = useCallback(async (content: string) => {
    await Clipboard.setStringAsync(content);
    if (Platform.OS === "android") {
      ToastAndroid.show(t("common.copied") ?? "Copied", ToastAndroid.SHORT);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [t]);

  const deleteMessage = useChatStore((s) => s.deleteMessageById);

  const handleDeleteMessage = useCallback((messageId: string) => {
    Alert.alert(t("common.delete"), t("chat.deleteMessageConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteMessage(messageId) },
    ]);
  }, [deleteMessage]);

  const regenerateMessage = useChatStore((s) => s.regenerateMessage);

  const handleTTS = useCallback((content: string) => {
    try {
      Speech.isSpeakingAsync().then((speaking: boolean) => {
        if (speaking) {
          Speech.stop();
        } else {
          Speech.speak(content, { rate: 0.9 });
        }
      }).catch(() => {
        Alert.alert("TTS", t("chat.ttsUnavailable") ?? "Text-to-speech is not available. Please rebuild the app.");
      });
    } catch {
      Alert.alert("TTS", t("chat.ttsUnavailable") ?? "Text-to-speech is not available. Please rebuild the app.");
    }
  }, [t]);

  const handleShareMessage = useCallback(async (content: string) => {
    try {
      await Share.share({ message: content });
    } catch {
      // User cancelled or share failed
    }
  }, []);

  // P3: 使用 useMemo 缓存列表配置，避免每次渲染重新创建
  const legendListProps = useMemo(() => ({
    contentContainerStyle: { flexGrow: 1, paddingTop: 12, paddingBottom: 8 },
    recycleItems: true,
    maintainScrollAtEnd: true,
    maintainScrollAtEndThreshold: 0.1,
    estimatedItemSize: 120,
    drawDistance: 250,
    getItemType: (item: Message) => {
      if (item.role === "user") return "user";
      if (item.generatedImages?.length) return "assistant-image";
      if (item.toolCalls?.length) return "assistant-tool";
      if (item.reasoningContent) return "assistant-reasoning";
      return "assistant";
    },
    scrollEventThrottle: 16,
    keyboardDismissMode: "on-drag" as const,
    keyboardShouldPersistTaps: "never" as const,
    showsVerticalScrollIndicator: false,
  }), []);

  const messageCountRef = useRef(messageCount);
  messageCountRef.current = messageCount;

  const blocksByMessageRef = useRef(blocksByMessage);
  blocksByMessageRef.current = blocksByMessage;

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const markdownWindow = 24;
      const shouldRenderMarkdown = index >= messageCountRef.current - markdownWindow;
      return (
        <MessageBubble
          message={item}
          blocks={blocksByMessageRef.current[item.id]}
          isGroup={isGroup}
          renderMarkdown={shouldRenderMarkdown}
          labelYou={t("chat.you")}
          labelThoughtProcess={t("chat.thoughtProcess")}
          onCopy={copyMessage}
          onRegenerate={item.role === "assistant" ? regenerateMessage : undefined}
          onDelete={handleDeleteMessage}
          onTTS={item.role === "assistant" ? handleTTS : undefined}
          onShare={item.role === "assistant" ? handleShareMessage : undefined}
        />
      );
    },
    [isGroup, copyMessage, regenerateMessage, handleDeleteMessage, handleTTS, handleShareMessage, t],
  );

  const handleExport = useCallback(async () => {
    if (!conv || isExporting) return;
    setIsExporting(true);
    try {
      const title = conv.title || t("chat.chatTitle");
      const date = new Date(conv.createdAt).toLocaleDateString();
      let md = `# ${title}\n\n> ${date}\n\n---\n\n`;
      for (const msg of messages) {
        const name = msg.role === "user" ? t("chat.you") : (msg.senderName ?? "AI");
        const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        md += `### ${name}  \`${time}\`\n\n`;
        if (msg.reasoningContent) {
          md += `<details>\n<summary>${t("chat.thoughtProcess")}</summary>\n\n${msg.reasoningContent}\n\n</details>\n\n`;
        }
        if (msg.content) {
          md += `${msg.content}\n\n`;
        }
        if (msg.images?.length) {
          md += `*[${msg.images.length} image(s) attached]*\n\n`;
        }
        md += `---\n\n`;
      }
      md += `\n*Exported from Talkio · ${new Date().toLocaleDateString()}*\n`;

      const safeName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 50);
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.md`;
      await FileSystem.writeAsStringAsync(fileUri, md, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: "text/markdown", UTI: "net.daringfireball.markdown" });
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [conv, messages, isExporting, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => { setModelPickerMode("add"); setShowModelPicker(true); }}
            className="p-2 active:opacity-60"
            hitSlop={4}
          >
            <Ionicons name="person-add-outline" size={19} color={colors.accent} />
          </Pressable>
          <Pressable
            onPress={handleExport}
            disabled={isExporting || !hasMessages}
            className="p-2 active:opacity-60"
            hitSlop={4}
            style={{ opacity: hasMessages ? 1 : 0 }}
          >
            <Ionicons name="share-outline" size={20} color={colors.accent} />
          </Pressable>
          <Pressable onPress={clearHistory} className="p-2 active:opacity-60" hitSlop={4}>
            <Ionicons name="create-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>
      ),
    });
  }, [hasMessages, clearHistory, handleExport, isExporting]);

  if (!conv) {
    // Still loading from DB — show blank screen instead of error
    if (!hasLoadedRef.current) {
      return <View className="flex-1 bg-bg-light" />;
    }
    return (
      <View className="flex-1 items-center justify-center bg-bg-light">
        <Text className="text-text-muted">{t("chat.conversationNotFound")}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg-chat">
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={50}
    >
      {/* Group participant panel */}
      {isGroup && showParticipants && conv && (
        <View className="border-b border-border-light bg-bg-card px-4 py-2">
          {conv.participants.map((p) => {
            const pModel = getModelById(p.modelId);
            const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
            const displayName = pModel?.displayName ?? p.modelId;
            return (
              <Swipeable
                key={p.id}
                renderRightActions={(_progress, dragX) => {
                  const scale = dragX.interpolate({
                    inputRange: [-80, 0],
                    outputRange: [1, 0.5],
                    extrapolate: "clamp",
                  });
                  return (
                    <Pressable
                      onPress={() => handleRemoveParticipant(p.id, displayName)}
                      style={{
                        width: 72,
                        backgroundColor: colors.danger,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 12,
                        marginLeft: 8,
                      }}
                    >
                      <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
                        <Ionicons name="trash-outline" size={18} color="#fff" />
                        <Text className="mt-0.5 text-[10px] font-medium text-white">{t("common.delete")}</Text>
                      </Animated.View>
                    </Pressable>
                  );
                }}
                overshootRight={false}
                friction={2}
              >
                <Pressable
                  onPress={() => handleParticipantPress(p.id)}
                  className="flex-row items-center gap-3 py-2.5 active:bg-bg-hover"
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Text className="text-xs font-bold text-primary">
                      {(displayName).slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-medium text-text-main" numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text className="text-[12px] text-text-hint" numberOfLines={1}>
                      {pIdentity ? pIdentity.name : t("chat.noIdentity")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.chevron} />
                </Pressable>
              </Swipeable>
            );
          })}
          <Pressable
            onPress={() => { setModelPickerMode("add"); setShowModelPicker(true); }}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border-light py-2.5 mt-1 mb-1 active:opacity-60"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <Text className="text-[13px] font-medium text-primary">{t("chat.addMember")}</Text>
          </Pressable>
        </View>
      )}

      {/* Model picker for adding members or switching model */}
      <ModelPickerModal
        visible={showModelPicker}
        excludeModelIds={[]}
        onSelect={handleModelPickerSelect}
        onClose={() => setShowModelPicker(false)}
        title={modelPickerMode === "switch" ? t("chat.switchModel") : t("chat.addMember")}
      />

      <LegendList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={messageKeyExtractor}
        {...legendListProps}
        onScroll={handleScroll}
      />

      {showScrollToBottom && (
        <Animated.View
          className="absolute bottom-2 right-4 z-10"
          style={{
            opacity: scrollBtnOpacity,
            transform: [{ scale: scrollBtnOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          }}
        >
          <Pressable
            onPress={scrollToBottom}
            className="flex-row items-center rounded-full bg-primary/90 px-3.5 py-2 active:opacity-70"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 }}
            hitSlop={8}
          >
            <Ionicons name="arrow-down" size={16} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        isGroup={isGroup}
        participants={stableParticipants}
        hasMessages={hasMessages}
        onStartAutoDiscuss={startAutoDiscuss}
        onStopAutoDiscuss={stopAutoDiscuss}
        autoDiscussRemaining={autoDiscussRemaining}
        autoDiscussTotalRounds={autoDiscussTotalRounds}
        modelName={!isGroup ? model?.displayName : undefined}
        onSwitchModel={!isGroup ? handleSwitchModel : undefined}
      />
    </KeyboardAvoidingView>

      {/* Identity BottomSheet — outside KAV so it renders on top */}
      <IdentitySlider
        visible={showIdentitySlider}
        activeIdentityId={
          editingParticipantId
            ? conv?.participants.find((p) => p.id === editingParticipantId)?.identityId ?? null
            : currentParticipant?.identityId ?? null
        }
        onSelect={handleIdentitySelect}
        onClose={handleIdentitySliderClose}
        label={
          isGroup && editingParticipantId
            ? (() => {
                const ep = conv?.participants.find((p) => p.id === editingParticipantId);
                const em = ep ? getModelById(ep.modelId) : null;
                return t("chat.setRoleFor", { name: em?.displayName ?? ep?.modelId ?? "" });
              })()
            : undefined
        }
      />
    </View>
  );
}
