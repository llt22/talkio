import { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, Platform, Alert, ActionSheetIOS, Share } from "react-native";
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

  const conversations = useChatStore((s) => s.conversations);
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const updateParticipantIdentity = useChatStore((s) => s.updateParticipantIdentity);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);

  const conv = conversations.find((c) => c.id === id);
  const isGroup = conv?.type === "group";
  const [showIdentitySlider, setShowIdentitySlider] = useState(false);
  const [selectedParticipantIdx, setSelectedParticipantIdx] = useState(0);

  const currentParticipant = conv?.participants[isGroup ? selectedParticipantIdx : 0];
  const model = currentParticipant ? getModelById(currentParticipant.modelId) : null;
  const activeIdentity = currentParticipant?.identityId
    ? getIdentityById(currentParticipant.identityId)
    : null;

  useEffect(() => {
    if (id) setCurrentConversation(id);
    return () => setCurrentConversation(null);
  }, [id]);

  useEffect(() => {
    const title = isGroup
      ? conv?.title ?? t("chat.group")
      : model?.displayName ?? t("chat.chatTitle");
    const subtitle = activeIdentity ? `◆ ${activeIdentity.name}` : isGroup ? undefined : `◆ ${t("chat.mountIdentity")}`;

    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          onPress={handleHeaderPress}
          className="items-center"
        >
          <Text className="text-sm font-bold tracking-tight text-text-main">{title}</Text>
          {subtitle && (
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
        <Pressable onPress={() => showChatOptions()} className="px-2">
          <Ionicons name="ellipsis-horizontal" size={22} color="#007AFF" />
        </Pressable>
      ),
    });
  }, [conv, model, activeIdentity, isGroup, showIdentitySlider]);

  const lastMsg = messages[messages.length - 1];
  const lastMsgContent = lastMsg?.content;

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 9999999, animated: true });
      }, 150);
    }
  }, [messages.length, lastMsgContent]);

  const handleSend = useCallback(
    (text: string, mentionedModelIds?: string[]) => {
      sendMessage(text, mentionedModelIds);
    },
    [sendMessage],
  );

  const handleIdentitySelect = useCallback(
    (identityId: string | null) => {
      if (id && currentParticipant) {
        updateParticipantIdentity(id, currentParticipant.modelId, identityId);
      }
      setShowIdentitySlider(false);
    },
    [id, currentParticipant, updateParticipantIdentity],
  );

  const handleHeaderPress = useCallback(() => {
    if (isGroup && conv) {
      // Cycle to next participant and open slider
      const nextIdx = (selectedParticipantIdx + 1) % conv.participants.length;
      setSelectedParticipantIdx(nextIdx);
      setShowIdentitySlider(true);
    } else {
      setShowIdentitySlider((v) => !v);
    }
  }, [isGroup, conv, selectedParticipantIdx]);

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

  const handleLongPress = useCallback((message: Message) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("common.cancel"), t("common.copy"), t("common.delete")],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (index) => {
          if (index === 1) copyMessage(message.content);
          if (index === 2) handleDeleteMessage(message.id);
        },
      );
    } else {
      Alert.alert(t("chat.messageOptions"), undefined, [
        { text: t("common.copy"), onPress: () => copyMessage(message.content) },
        { text: t("common.delete"), style: "destructive", onPress: () => handleDeleteMessage(message.id) },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    }
  }, [copyMessage, handleDeleteMessage]);

  const exportChat = useCallback(async () => {
    const lines = messages.map((m) => `[${m.senderName ?? m.role}]: ${m.content}`);
    const text = lines.join("\n\n");
    try {
      await Share.share({ message: text, title: conv?.title ?? "Chat Export" });
    } catch {
      // user cancelled
    }
  }, [messages, conv]);

  const clearHistory = useCallback(() => {
    if (!id) return;
    Alert.alert(t("chat.clearHistory"), t("chat.clearHistoryConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          for (const msg of messages) {
            await useChatStore.getState().deleteMessageById(msg.id);
          }
        },
      },
    ]);
  }, [id, messages]);

  const showChatOptions = () => {
    const options = [t("common.cancel"), t("chat.export"), t("chat.clearHistory")];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (index) => {
          if (index === 1) exportChat();
          if (index === 2) clearHistory();
        },
      );
    } else {
      Alert.alert(t("chat.messageOptions"), undefined, [
        { text: t("chat.export"), onPress: exportChat },
        { text: t("chat.clearHistory"), style: "destructive", onPress: clearHistory },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        isGroup={isGroup}
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
      <IdentitySlider
        visible={showIdentitySlider}
        activeIdentityId={currentParticipant?.identityId ?? null}
        onSelect={handleIdentitySelect}
      />

      <LegendList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
        recycleItems
        maintainScrollAtEnd
        maintainScrollAtEndThreshold={0.1}
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
