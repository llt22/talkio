import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, Platform, Alert, ActionSheetIOS } from "react-native";
import * as Clipboard from "expo-clipboard";
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

export default function ChatDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const listRef = useRef<LegendListRef>(null);

  const conv = useChatStore(
    useCallback((s) => s.conversations.find((c) => c.id === id), [id]),
  );
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const updateParticipantIdentity = useChatStore((s) => s.updateParticipantIdentity);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const isGroup = conv?.type === "group";
  const [showIdentitySlider, setShowIdentitySlider] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [editingParticipantModelId, setEditingParticipantModelId] = useState<string | null>(null);
  const userScrolledAway = useRef(false);
  const isDragging = useRef(false);

  // For single chat, use the first participant
  const currentParticipant = conv?.participants[0];
  const model = currentParticipant ? getModelById(currentParticipant.modelId) : null;
  const activeIdentity = currentParticipant?.identityId
    ? getIdentityById(currentParticipant.identityId)
    : null;

  useEffect(() => {
    if (id) setCurrentConversation(id);
    return () => setCurrentConversation(null);
  }, [id]);

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

  useEffect(() => {
    const title = isGroup
      ? conv?.title ?? t("chat.group")
      : model?.displayName ?? t("chat.chatTitle");

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
                {t("chat.modelCount", { count: conv?.participants.length ?? 0 })}
              </Text>
              <Ionicons name={showParticipants ? "chevron-up" : "chevron-down"} size={12} color="#007AFF" />
            </View>
          ) : (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="person-circle-outline" size={12} color="#007AFF" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {activeIdentity ? activeIdentity.name : t("chat.mountIdentity")}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#007AFF" />
            </View>
          )}
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={clearHistory} className="px-2">
          <Ionicons name="create-outline" size={20} color="#007AFF" />
        </Pressable>
      ),
    });
  }, [conv, model, activeIdentity, isGroup, showParticipants, clearHistory]);

  const lastMsg = messages[messages.length - 1];
  const lastMsgContent = lastMsg?.content;
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (messages.length === 0 || userScrolledAway.current) return;
    // Throttle: only scroll once per 400ms during streaming
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null;
      if (!userScrolledAway.current) {
        listRef.current?.scrollToOffset({ offset: 9999999, animated: false });
      }
    }, 400);
  }, [messages.length, lastMsgContent]);

  const handleScroll = useCallback((e: any) => {
    // Only update flag during user drag, ignore programmatic/content-growth scrolls
    if (!isDragging.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceFromBottom > 120) {
      // User scrolled away from bottom
      userScrolledAway.current = true;
    } else if (distanceFromBottom < 80) {
      // User scrolled back to bottom
      userScrolledAway.current = false;
    }
  }, []);

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
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const lastAssistantIdRef = useRef(lastAssistantId);
  lastAssistantIdRef.current = lastAssistantId;

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        isGroup={isGroup}
        isLastAssistant={item.id === lastAssistantIdRef.current}
        onLongPress={handleLongPress}
      />
    ),
    [isGroup, handleLongPress],
  );

  if (!conv) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
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
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
        recycleItems
        maintainScrollAtEnd={!userScrolledAway.current}
        maintainScrollAtEndThreshold={0.1}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        isGroup={isGroup}
        participants={conv.participants}
      />
    </KeyboardAvoidingView>
    </View>
  );
}
