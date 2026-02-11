import { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Alert, ActionSheetIOS } from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useChatStore } from "../../../src/stores/chat-store";
import { useProviderStore } from "../../../src/stores/provider-store";
import { useIdentityStore } from "../../../src/stores/identity-store";
import { MessageBubble } from "../../../src/components/chat/MessageBubble";
import { ChatInput } from "../../../src/components/chat/ChatInput";
import { IdentitySlider } from "../../../src/components/chat/IdentitySlider";
import type { Message } from "../../../src/types";

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const listRef = useRef<FlashListRef<Message>>(null);

  const conversations = useChatStore((s) => s.conversations);
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const updateParticipantIdentity = useChatStore((s) => s.updateParticipantIdentity);
  const branchFromMessage = useChatStore((s) => s.branchFromMessage);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);

  const conv = conversations.find((c) => c.id === id);
  const isGroup = conv?.type === "group";
  const [showIdentitySlider, setShowIdentitySlider] = useState(false);

  const firstParticipant = conv?.participants[0];
  const model = firstParticipant ? getModelById(firstParticipant.modelId) : null;
  const activeIdentity = firstParticipant?.identityId
    ? getIdentityById(firstParticipant.identityId)
    : null;

  useEffect(() => {
    if (id) setCurrentConversation(id);
    return () => setCurrentConversation(null);
  }, [id]);

  useEffect(() => {
    const title = isGroup
      ? conv?.title ?? "Group"
      : model?.displayName ?? "Chat";
    const subtitle = activeIdentity ? `◆ ${activeIdentity.name}` : isGroup ? undefined : "◆ Mount Identity";

    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          onPress={() => !isGroup && setShowIdentitySlider((v) => !v)}
          className="items-center"
        >
          <Text className="text-base font-semibold text-text-main">{title}</Text>
          {subtitle && (
            <Text className="text-xs text-primary">{subtitle}</Text>
          )}
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={() => showChatOptions()} className="px-2">
          <Ionicons name="ellipsis-horizontal" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [conv, model, activeIdentity, isGroup, showIdentitySlider]);

  const lastMsg = messages[messages.length - 1];
  const lastMsgContent = lastMsg?.content;

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
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
      if (id && firstParticipant) {
        updateParticipantIdentity(id, firstParticipant.modelId, identityId);
      }
      setShowIdentitySlider(false);
    },
    [id, firstParticipant, updateParticipantIdentity],
  );

  const handleBranch = useCallback(
    (messageId: string) => {
      Alert.alert("Branch Conversation", "Create a new branch from this message?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Branch",
          onPress: () => branchFromMessage(messageId),
        },
      ]);
    },
    [branchFromMessage],
  );

  const handleLongPress = useCallback((message: Message) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Copy", "Branch from here", "Delete"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
        },
        (index) => {
          if (index === 2) handleBranch(message.id);
        },
      );
    } else {
      Alert.alert("Message Options", undefined, [
        { text: "Copy", onPress: () => {} },
        { text: "Branch", onPress: () => handleBranch(message.id) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [handleBranch]);

  const showChatOptions = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Search in Chat", "Export", "Clear History"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
        },
        (_index) => {},
      );
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        isGroup={isGroup}
        onLongPress={handleLongPress}
        onBranch={handleBranch}
      />
    ),
    [isGroup, handleLongPress, handleBranch],
  );

  if (!conv) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-text-muted">Conversation not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-chat"
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 100}
    >
      {!isGroup && (
        <IdentitySlider
          visible={showIdentitySlider}
          activeIdentityId={firstParticipant?.identityId ?? null}
          onSelect={handleIdentitySelect}
        />
      )}

      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
      />

      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        isGroup={isGroup}
        participants={conv.participants}
        showQuickPrompts={!isGroup}
      />
    </KeyboardAvoidingView>
  );
}
