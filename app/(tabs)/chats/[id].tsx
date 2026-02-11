import { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, Platform, Alert, ActionSheetIOS } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { LegendList } from "@legendapp/list";
import type { LegendListRef } from "@legendapp/list";
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
  const listRef = useRef<LegendListRef>(null);

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
          <Text className="text-sm font-bold tracking-tight text-text-main">{title}</Text>
          {subtitle && (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="layers-outline" size={12} color="#007AFF" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {activeIdentity ? activeIdentity.name : "Mount Identity"}
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

  const handleSwipeGesture = useCallback((event: any) => {
    const { translationX, velocityX, state: gestureState } = event.nativeEvent;
    if (gestureState === State.END && translationX > 0) {
      const hasGoodDistance = translationX > 20;
      const hasGoodVelocity = velocityX > 100;
      const hasExcellentDistance = translationX > 80;
      if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
        router.back();
      }
    }
  }, [router]);

  return (
    <PanGestureHandler
      onGestureEvent={handleSwipeGesture}
      onHandlerStateChange={handleSwipeGesture}
      activeOffsetX={[0, 10]}
      failOffsetY={[-20, 20]}
    >
    <KeyboardAvoidingView
      className="flex-1 bg-bg-chat"
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 80}
    >
      {!isGroup && (
        <IdentitySlider
          visible={showIdentitySlider}
          activeIdentityId={firstParticipant?.identityId ?? null}
          onSelect={handleIdentitySelect}
        />
      )}

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
        showQuickPrompts={!isGroup}
      />
    </KeyboardAvoidingView>
    </PanGestureHandler>
  );
}
