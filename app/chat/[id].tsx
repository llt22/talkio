import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, Platform, Alert, ActionSheetIOS } from "react-native";
import * as Clipboard from "expo-clipboard";
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
import { useMessages } from "../../src/hooks/useMessages";
import { useConversations } from "../../src/hooks/useConversations";
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
  const activeBranchId = useChatStore((s) => s.activeBranchId);
  const messages = useMessages(id ?? null, activeBranchId);
  const isGenerating = useChatStore((s) => s.isGenerating);

  const hasMessages = messages.length > 0;
  const messageCount = messages.length;
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const updateParticipantIdentity = useChatStore((s) => s.updateParticipantIdentity);
  const addParticipant = useChatStore((s) => s.addParticipant);
  const removeParticipant = useChatStore((s) => s.removeParticipant);
  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const isGroup = conv?.type === "group";
  const participants = conv?.participants;
  const prevParticipantsRef = useRef(participants);
  if (
    participants !== prevParticipantsRef.current &&
    participants &&
    prevParticipantsRef.current &&
    participants.length === prevParticipantsRef.current.length &&
    participants.every((p, i) => p.modelId === prevParticipantsRef.current![i].modelId && p.identityId === prevParticipantsRef.current![i].identityId)
  ) {
    // shallow-equal: keep previous reference to avoid downstream re-renders
  } else {
    prevParticipantsRef.current = participants;
  }
  const stableParticipants = prevParticipantsRef.current ?? [];
  const [showIdentitySlider, setShowIdentitySlider] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [editingParticipantModelId, setEditingParticipantModelId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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

  // Scroll management: all content is data items, maintainScrollAtEnd handles auto-scrolling.
  // useLiveQuery loads all messages, no pagination needed.
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setShowScrollToBottom(distanceFromBottom > 100);
  }, []);

  const handleSend = useCallback(
    (text: string, mentionedModelIds?: string[], images?: string[]) => {
      setShowScrollToBottom(false);
      sendMessage(text, mentionedModelIds, images);
    },
    [sendMessage],
  );

  const scrollToBottom = useCallback(() => {
    setShowScrollToBottom(false);
    listRef.current?.scrollToOffset({ offset: 9999999, animated: true });
  }, []);

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

  const handleAddParticipant = useCallback((modelId: string) => {
    if (id) addParticipant(id, modelId);
  }, [id, addParticipant]);

  const handleRemoveParticipant = useCallback((modelId: string, displayName: string) => {
    if (!id) return;
    Alert.alert(displayName, t("chat.removeMemberConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("chat.removeMember"),
        style: "destructive",
        onPress: () => removeParticipant(id, modelId),
      },
    ]);
  }, [id, removeParticipant, t]);

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

  // P3: 使用 useMemo 缓存列表配置，避免每次渲染重新创建
  const legendListProps = useMemo(() => ({
    contentContainerStyle: { paddingTop: 12, paddingBottom: 8 },
    recycleItems: true,
    alignItemsAtEnd: true,
    maintainScrollAtEnd: { onLayout: true, onItemLayout: true, onDataChange: true },
    maintainScrollAtEndThreshold: 0.2,
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
    scrollEventThrottle: 16,
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
            onPress={handleExport}
            disabled={isExporting || !hasMessages}
            className="p-2"
            hitSlop={4}
            style={{ opacity: hasMessages ? 1 : 0 }}
          >
            <Ionicons name="share-outline" size={20} color="#007AFF" />
          </Pressable>
          <Pressable onPress={clearHistory} className="p-2" hitSlop={4}>
            <Ionicons name="create-outline" size={20} color="#007AFF" />
          </Pressable>
        </View>
      ),
    });
  }, [hasMessages, clearHistory, handleExport, isExporting]);

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
                  <View className="flex-1 mr-2">
                    <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={1}>
                      {pModel?.displayName ?? p.modelId}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => handleEditParticipantIdentity(p.modelId)}
                    className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1.5"
                  >
                    <Ionicons name="person-outline" size={12} color="#64748b" style={{ marginRight: 3 }} />
                    <Text className="text-[11px] text-slate-600" numberOfLines={1}>
                      {pIdentity ? pIdentity.name : t("chat.noIdentity")}
                    </Text>
                  </Pressable>
                  {conv.participants.length > 1 && (
                    <Pressable
                      onPress={() => handleRemoveParticipant(p.modelId, pModel?.displayName ?? p.modelId)}
                      hitSlop={6}
                      className="items-center justify-center rounded-full bg-red-50 p-1.5"
                    >
                      <Ionicons name="close" size={14} color="#ef4444" />
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
          <Pressable
            onPress={() => setShowModelPicker(true)}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 mt-1 mb-1"
          >
            <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
            <Text className="text-[13px] font-medium text-primary">{t("chat.addMember")}</Text>
          </Pressable>
        </View>
      )}

      {/* Model picker for adding group members */}
      <ModelPickerModal
        visible={showModelPicker}
        excludeModelIds={conv?.participants.map((p) => p.modelId) ?? []}
        onSelect={handleAddParticipant}
        onClose={() => setShowModelPicker(false)}
      />

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
        {...legendListProps}
        onScroll={handleScroll}
      />

      {showScrollToBottom && (
        <View className="absolute right-4 z-10" style={{ top: "50%" }}>
          <Pressable
            onPress={scrollToBottom}
            className="h-10 w-10 items-center justify-center rounded-full bg-white"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 }}
            hitSlop={8}
          >
            <Ionicons name="chevron-down" size={20} color="#007AFF" />
          </Pressable>
        </View>
      )}

      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        isGroup={isGroup}
        participants={stableParticipants}
        hasMessages={hasMessages}
      />
    </KeyboardAvoidingView>
    </View>
  );
}
