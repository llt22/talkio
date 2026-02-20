import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, Platform, Alert, ActionSheetIOS, Modal, ScrollView, ActivityIndicator, InteractionManager } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { KeyboardAvoidingView, KeyboardController } from "react-native-keyboard-controller";
import { useTranslation } from "react-i18next";
import { LegendList } from "@legendapp/list";
import type { LegendListRef } from "@legendapp/list";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useChatStore } from "../../src/stores/chat-store";
import { useProviderStore } from "../../src/stores/provider-store";
import { useIdentityStore } from "../../src/stores/identity-store";
import { MessageBubble } from "../../src/components/chat/MessageBubble";
import { ChatInput } from "../../src/components/chat/ChatInput";
import { IdentitySlider } from "../../src/components/chat/IdentitySlider";
import type { Message } from "../../src/types";

KeyboardController.preload();

const messageKeyExtractor = (item: Message) => item.id;

export default function ChatDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const listRef = useRef<LegendListRef>(null);
  const exportRef = useRef<View>(null);
  const [showExport, setShowExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const conv = useChatStore(
    useCallback((s) => s.conversations.find((c) => c.id === id), [id]),
  );
  const rawMessages = useChatStore((s) => s.messages);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  // Exclude streaming message from list data to avoid duplicate with ListFooterComponent
  const messages = useMemo(
    () => streamingMessage ? rawMessages.filter((m) => m.id !== streamingMessage.id) : rawMessages,
    [rawMessages, streamingMessage],
  );
  const isGenerating = useChatStore((s) => s.isGenerating);
  const hasMoreMessages = useChatStore((s) => s.hasMoreMessages);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);
  const loadMoreMessages = useChatStore((s) => s.loadMoreMessages);

  const hasMessages = messages.length > 0 || !!streamingMessage;
  const messageCount = messages.length + (streamingMessage ? 1 : 0);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const updateParticipantIdentity = useChatStore((s) => s.updateParticipantIdentity);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const isGroup = conv?.type === "group";
  const participants = conv?.participants;
  const stableParticipants = useMemo(() => participants ?? [], [JSON.stringify(participants)]);
  const [showIdentitySlider, setShowIdentitySlider] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [editingParticipantModelId, setEditingParticipantModelId] = useState<string | null>(null);
  const userScrolledAway = useRef(false);
  const isDragging = useRef(false);
  const loadMoreCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // For single chat, use the first participant
  const currentParticipant = conv?.participants[0];
  const model = currentParticipant ? getModelById(currentParticipant.modelId) : null;
  const activeIdentity = currentParticipant?.identityId
    ? getIdentityById(currentParticipant.identityId)
    : null;

  useEffect(() => {
    // P1: 立即设置当前会话，但延迟消息加载到导航动画后
    if (id) {
      const raf = requestAnimationFrame(() => {
        setCurrentConversation(id, { deferLoad: true });
      });

      return () => {
        cancelAnimationFrame(raf);
        const previousId = id;
        InteractionManager.runAfterInteractions(() => {
          // 仅当仍然停留在该会话时才清理，避免切换对话时误清空
          if (useChatStore.getState().currentConversationId === previousId) {
            setCurrentConversation(null);
          }
        });
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

  useEffect(() => {
    const title = isGroup
      ? convTitle ?? t("chat.group")
      : modelDisplayName ?? t("chat.chatTitle");

    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          onPress={handleHeaderPress}
          className="items-center"
        >
          <Text className="text-sm font-bold tracking-tight text-text-main">{title}</Text>
          {isGroup ? (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="people-outline" size={12} color="#007AFF" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {t("chat.modelCount", { count: participantCount })}
              </Text>
              <Ionicons name={showParticipants ? "chevron-up" : "chevron-down"} size={12} color="#007AFF" />
            </View>
          ) : (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="person-circle-outline" size={12} color="#007AFF" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {identityName ?? t("chat.mountIdentity")}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#007AFF" />
            </View>
          )}
        </Pressable>
      ),
    });
  }, [convTitle, modelDisplayName, identityName, participantCount, isGroup, showParticipants]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center gap-1">
          {hasMessages && (
            <Pressable onPress={() => setShowExport(true)} className="p-2" hitSlop={4}>
              <Ionicons name="image-outline" size={20} color="#007AFF" />
            </Pressable>
          )}
          <Pressable onPress={clearHistory} className="p-2" hitSlop={4}>
            <Ionicons name="create-outline" size={20} color="#007AFF" />
          </Pressable>
        </View>
      ),
    });
  }, [hasMessages, clearHistory]);

  const streamingContent = streamingMessage?.content;
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (messageCount === 0 || userScrolledAway.current) return;
    // Throttle: only scroll once per 400ms during streaming
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null;
      if (!userScrolledAway.current) {
        listRef.current?.scrollToOffset({ offset: 9999999, animated: false });
      }
    }, 400);
  }, [messageCount, streamingContent]);

  const handleScroll = useCallback((e: any) => {
    // Only update flag during user drag, ignore programmatic/content-growth scrolls
    if (!isDragging.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const distanceFromTop = contentOffset.y;
    if (distanceFromBottom > 120) {
      // User scrolled away from bottom
      userScrolledAway.current = true;
    } else if (distanceFromBottom < 80) {
      // User scrolled back to bottom
      userScrolledAway.current = false;
    }
    if (distanceFromTop < 120 && hasMoreMessages && !isLoadingMore) {
      if (!loadMoreCooldownRef.current) {
        loadMoreMessages();
        loadMoreCooldownRef.current = setTimeout(() => {
          loadMoreCooldownRef.current = null;
        }, 500);
      }
    }
  }, [hasMoreMessages, isLoadingMore, loadMoreMessages]);

  const handleScrollBeginDrag = useCallback(() => {
    isDragging.current = true;
    userScrolledAway.current = true;
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleSend = useCallback(
    (text: string, mentionedModelIds?: string[], images?: string[]) => {
      userScrolledAway.current = false;
      sendMessage(text, mentionedModelIds, images);
    },
    [sendMessage],
  );

  const handleIdentitySelect = useCallback(
    (identityId: string | null) => {
      const targetModelId = editingParticipantModelId ?? currentParticipant?.modelId;
      if (id && targetModelId) {
        updateParticipantIdentity(id, targetModelId, identityId);
      }
      setShowIdentitySlider(false);
      setEditingParticipantModelId(null);
    },
    [id, editingParticipantModelId, currentParticipant, updateParticipantIdentity],
  );

  const handleHeaderPress = useCallback(() => {
    if (isGroup) {
      setShowParticipants((v) => !v);
      setShowIdentitySlider(false);
    } else {
      setShowIdentitySlider((v) => !v);
    }
  }, [isGroup]);

  const handleEditParticipantIdentity = useCallback((modelId: string) => {
    setEditingParticipantModelId(modelId);
    setShowIdentitySlider(true);
  }, []);

  const copyMessage = useCallback(async (content: string) => {
    await Clipboard.setStringAsync(content);
  }, []);

  const deleteMessage = useChatStore((s) => s.deleteMessageById);

  const handleDeleteMessage = useCallback((messageId: string) => {
    Alert.alert(t("common.delete"), t("chat.deleteMessageConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteMessage(messageId) },
    ]);
  }, [deleteMessage]);

  const regenerateMessage = useChatStore((s) => s.regenerateMessage);

  const handleLongPress = useCallback((message: Message) => {
    const isAssistant = message.role === "assistant";

    if (Platform.OS === "ios") {
      const options = isAssistant
        ? [t("common.cancel"), t("common.copy"), t("chat.rewrite"), t("chat.translate"), t("chat.summarize"), t("common.delete")]
        : [t("common.cancel"), t("common.copy"), t("common.delete")];
      const destructiveIndex = isAssistant ? 5 : 2;

      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, destructiveButtonIndex: destructiveIndex },
        (index) => {
          if (isAssistant) {
            if (index === 1) copyMessage(message.content);
            if (index === 2) regenerateMessage(message.id);
            if (index === 3) handleSend(`Translate the following to ${t("common.cancel") === "取消" ? "English" : "Chinese"}:\n\n${message.content}`);
            if (index === 4) handleSend(`Summarize the following concisely:\n\n${message.content}`);
            if (index === 5) handleDeleteMessage(message.id);
          } else {
            if (index === 1) copyMessage(message.content);
            if (index === 2) handleDeleteMessage(message.id);
          }
        },
      );
    } else {
      const buttons: Array<{ text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }> = [
        { text: t("common.copy"), onPress: () => { copyMessage(message.content); } },
      ];
      if (isAssistant) {
        buttons.push(
          { text: t("chat.rewrite"), onPress: () => { regenerateMessage(message.id); } },
          { text: t("chat.translate"), onPress: () => { handleSend(`Translate the following to ${t("common.cancel") === "取消" ? "English" : "Chinese"}:\n\n${message.content}`); } },
          { text: t("chat.summarize"), onPress: () => { handleSend(`Summarize the following concisely:\n\n${message.content}`); } },
        );
      }
      buttons.push(
        { text: t("common.delete"), style: "destructive", onPress: () => handleDeleteMessage(message.id) },
        { text: t("common.cancel"), style: "cancel" },
      );
      Alert.alert(t("chat.messageOptions"), undefined, buttons);
    }
  }, [copyMessage, handleDeleteMessage, regenerateMessage, handleSend]);

  const lastAssistantId = useMemo(() => {
    if (streamingMessage?.role === "assistant") return streamingMessage.id;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages, streamingMessage]);

  const lastAssistantIdRef = useRef(lastAssistantId);
  lastAssistantIdRef.current = lastAssistantId;

  // P3: 使用 useMemo 缓存列表配置，避免每次渲染重新创建
  const legendListProps = useMemo(() => ({
    contentContainerStyle: { paddingTop: 12, paddingBottom: 8 },
    recycleItems: true,
    maintainScrollAtEnd: true,
    maintainScrollAtEndThreshold: 0.1,
    estimatedItemSize: 120,
    drawDistance: 200,
    waitForInitialLayout: true,
    getItemType: (item: Message) => {
      if (item.role === "user") return "user";
      if (item.generatedImages?.length) return "assistant-image";
      if (item.toolCalls?.length) return "assistant-tool";
      if (item.reasoningContent) return "assistant-reasoning";
      return "assistant";
    },
    scrollEventThrottle: 100,
    keyboardDismissMode: "on-drag" as const,
    keyboardShouldPersistTaps: "handled" as const,
    showsVerticalScrollIndicator: false,
  }), []);

  const messageCountRef = useRef(messageCount);
  messageCountRef.current = messageCount;

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const markdownWindow = 24;
      const shouldRenderMarkdown = index >= messageCountRef.current - markdownWindow;
      return (
        <MessageBubble
          message={item}
          isGroup={isGroup}
          isLastAssistant={item.id === lastAssistantIdRef.current}
          renderMarkdown={shouldRenderMarkdown}
          labelYou={t("chat.you")}
          labelThoughtProcess={t("chat.thoughtProcess")}
          onLongPress={handleLongPress}
        />
      );
    },
    [isGroup, handleLongPress, t],
  );

  const listFooter = useMemo(() => {
    if (!streamingMessage) return null;
    return (
      <MessageBubble
        message={streamingMessage}
        isGroup={isGroup}
        isLastAssistant={false}
        renderMarkdown
        labelYou={t("chat.you")}
        labelThoughtProcess={t("chat.thoughtProcess")}
        onLongPress={handleLongPress}
      />
    );
  }, [streamingMessage, isGroup, handleLongPress, t]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // Wait for render
      await new Promise((r) => setTimeout(r, 500));
      const uri = await captureRef(exportRef, {
        format: "png",
        quality: 1,
        snapshotContentContainer: true,
      });
      setShowExport(false);
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [t]);

  if (!conv) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-text-muted">{t("chat.conversationNotFound")}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg-chat">
    {/* Export modal - only render content when visible */}
    {showExport && (
      <Modal visible animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3 pt-14">
            <Pressable onPress={() => setShowExport(false)}>
              <Text className="text-base text-primary">{t("common.cancel")}</Text>
            </Pressable>
            <Text className="text-base font-semibold">{t("chat.export")}</Text>
            <Pressable onPress={handleExport} disabled={isExporting}>
              {isExporting ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <Text className="text-base font-semibold text-primary">{t("common.save")}</Text>
              )}
            </Pressable>
          </View>
          <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 16 }}>
            <View ref={exportRef} collapsable={false} className="bg-white pb-6">
              <View className="items-center py-4 mb-2">
                <Text className="text-lg font-bold text-slate-800">{conv.title || t("chat.chatTitle")}</Text>
                <Text className="text-xs text-slate-400 mt-1">{new Date(conv.createdAt).toLocaleDateString()}</Text>
              </View>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isGroup={isGroup}
                  labelYou={t("chat.you")}
                  labelThoughtProcess={t("chat.thoughtProcess")}
                />
              ))}
              <View className="items-center mt-4 pt-4 border-t border-slate-100 mx-8">
                <Text className="text-[10px] text-slate-300">Talkio · {new Date().toLocaleDateString()}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    )}
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={50}
    >
      {/* Group participant panel */}
      {isGroup && showParticipants && conv && (
        <View className="border-b border-slate-100 bg-white px-4 py-2">
          {conv.participants.map((p) => {
            const pModel = getModelById(p.modelId);
            const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
            return (
              <View key={p.modelId} className="flex-row items-center justify-between py-2">
                <View className="flex-row items-center flex-1">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/10 mr-3">
                    <Text className="text-xs font-bold text-primary">
                      {(pModel?.displayName ?? "?").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={1}>
                      {pModel?.displayName ?? p.modelId}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => handleEditParticipantIdentity(p.modelId)}
                  className="flex-row items-center rounded-full bg-slate-100 px-3 py-1.5"
                >
                  <Ionicons name="person-outline" size={12} color="#64748b" style={{ marginRight: 4 }} />
                  <Text className="text-[12px] text-slate-600">
                    {pIdentity ? pIdentity.name : t("chat.noIdentity")}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color="#94a3b8" style={{ marginLeft: 2 }} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* Identity slider */}
      <IdentitySlider
        visible={showIdentitySlider}
        activeIdentityId={
          editingParticipantModelId
            ? conv?.participants.find((p) => p.modelId === editingParticipantModelId)?.identityId ?? null
            : currentParticipant?.identityId ?? null
        }
        onSelect={handleIdentitySelect}
      />

      <LegendList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={messageKeyExtractor}
        ListFooterComponent={listFooter}
        {...legendListProps}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
      />

      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        isGroup={isGroup}
        participants={stableParticipants}
      />
    </KeyboardAvoidingView>
    </View>
  );
}
