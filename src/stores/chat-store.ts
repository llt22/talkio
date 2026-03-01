/**
 * Chat Store — manages conversations and streaming SSE.
 * Uses SQLite for persistence + in-memory streaming state.
 * Generation logic extracted to chat-generation.ts.
 */
import { create } from "zustand";
import type { Message, Conversation, ConversationParticipant, SpeakingOrder } from "../types";
import { MessageStatus } from "../types";
import {
  resolveTargetParticipants,
  createUserMessage,
  buildApiMessagesForParticipant,
} from "./chat-message-builder";
import {
  insertConversation,
  updateConversation,
  deleteConversation as dbDeleteConversation,
  getConversation,
  insertMessage,
  updateMessage,
  getRecentMessages,
  deleteMessage as dbDeleteMessage,
  clearMessages as dbClearMessages,
  insertMessages,
} from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { useProviderStore } from "./provider-store";
import { generateId } from "../lib/id";
import { buildProviderHeaders } from "../services/provider-headers";
import { useSettingsStore } from "./settings-store";
import { generateForParticipant, type StreamingState } from "./chat-generation";
import { estimateMessagesTokens, compressIfNeeded } from "../lib/context-compression";
import i18n from "../i18n";

const MAX_HISTORY = 200;

// Per-conversation generation tracking (module-level to avoid zustand serialization)
const _abortControllers = new Map<string, AbortController>();
const _streamingMessages = new Map<string, StreamingState>();

export interface ChatState {
  currentConversationId: string | null;
  isGenerating: boolean;
  activeBranchId: string | null;
  autoDiscussRemaining: number;
  autoDiscussTotalRounds: number;

  // In-memory streaming state — not persisted, used for rAF updates
  streamingMessage: StreamingState | null;

  createConversation: (
    modelId: string,
    extraModelIds?: string[],
    membersWithIdentity?: { modelId: string; identityId: string | null }[],
  ) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  sendMessage: (
    text: string,
    images?: string[],
    options?: { reuseUserMessageId?: string; mentionedParticipantIds?: string[] },
  ) => Promise<void>;
  stopGeneration: () => void;
  startAutoDiscuss: (rounds: number, topicText?: string) => Promise<void>;
  stopAutoDiscuss: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  branchFromMessage: (messageId: string, messages: Message[]) => Promise<string>;
  switchBranch: (branchId: string | null) => void;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessageById: (messageId: string) => Promise<void>;
  clearConversationMessages: (conversationId: string) => Promise<void>;
  searchAllMessages: (query: string) => Promise<Message[]>;
  updateParticipantIdentity: (
    conversationId: string,
    participantId: string,
    identityId: string | null,
  ) => Promise<void>;
  updateParticipantModel: (
    conversationId: string,
    participantId: string,
    modelId: string,
  ) => Promise<void>;
  addParticipant: (
    conversationId: string,
    modelId: string,
    identityId?: string | null,
  ) => Promise<void>;
  addParticipants: (
    conversationId: string,
    members: { modelId: string; identityId: string | null }[],
  ) => Promise<void>;
  removeParticipant: (conversationId: string, participantId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  updateSpeakingOrder: (conversationId: string, order: SpeakingOrder) => Promise<void>;
  reorderParticipants: (conversationId: string, participantIds: string[]) => Promise<void>;
}

/** Generate an auto-title from participant model names */
function autoTitle(
  participants: ConversationParticipant[],
  providerStore: ReturnType<typeof useProviderStore.getState>,
): string {
  const names = participants.map(
    (p) => providerStore.getModelById(p.modelId)?.displayName ?? p.modelId,
  );
  if (names.length <= 1) return names[0] ?? "";
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")}...`;
}

/** Pre-compute compression summary once for all participants in group chat */
async function preComputeCompression(
  cid: string,
  conversation: Conversation,
  targets: ConversationParticipant[],
  userMsg: Message,
  abortController: AbortController,
  activeBranchId: string | null,
): Promise<string | null> {
  const compressionSettings = useSettingsStore.getState().settings;
  if (!compressionSettings.contextCompressionEnabled || targets.length === 0) return null;

  const providerStore = useProviderStore.getState();
  const firstModel = providerStore.getModelById(targets[0].modelId);
  const firstProvider = firstModel ? providerStore.getProviderById(firstModel.providerId) : null;
  if (!firstModel || !firstProvider || firstProvider.type !== "openai") return null;

  const allMsgs = await getRecentMessages(cid, activeBranchId, MAX_HISTORY);
  const filtered = allMsgs.filter((m) => m.status === MessageStatus.SUCCESS || m.id === userMsg.id);
  const sampleApiMessages = buildApiMessagesForParticipant(filtered, targets[0], conversation);
  const tokenCount = estimateMessagesTokens(sampleApiMessages);
  if (tokenCount <= compressionSettings.contextCompressionThreshold) return null;

  const baseUrl = firstProvider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(firstProvider, { "Content-Type": "application/json" });
  const result = await compressIfNeeded(sampleApiMessages, {
    maxTokens: compressionSettings.contextCompressionThreshold,
    keepRecentCount: 6,
    baseUrl,
    headers,
    model: firstModel.modelId,
    signal: abortController.signal,
  });
  if (!result.compressed) return null;

  const summaryMsg = result.messages.find(
    (m) =>
      typeof m.content === "string" &&
      (m.content as string).startsWith("[Previous conversation summary]"),
  );
  return summaryMsg ? (summaryMsg.content as string) : null;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversationId: null,
  isGenerating: false,
  activeBranchId: null,
  autoDiscussRemaining: 0,
  autoDiscussTotalRounds: 0,
  streamingMessage: null,

  createConversation: async (
    modelId: string,
    extraModelIds?: string[],
    membersWithIdentity?: { modelId: string; identityId: string | null }[],
  ) => {
    const providerStore = useProviderStore.getState();
    const model = providerStore.getModelById(modelId);
    let participants: ConversationParticipant[];
    if (membersWithIdentity && membersWithIdentity.length > 0) {
      participants = membersWithIdentity.map((m) => ({
        id: generateId(),
        modelId: m.modelId,
        identityId: m.identityId,
      }));
    } else {
      const allIds = [modelId, ...(extraModelIds ?? [])];
      participants = allIds.map((mid) => ({
        id: generateId(),
        modelId: mid,
        identityId: null,
      }));
    }
    const isGroup = participants.length > 1;
    const conv: Conversation = {
      id: generateId(),
      type: isGroup ? "group" : "single",
      title: isGroup
        ? autoTitle(participants, providerStore)
        : (model?.displayName ?? i18n.t("chats.newChat", { defaultValue: "New Chat" })),
      participants,
      lastMessage: null,
      lastMessageAt: null,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await insertConversation(conv);
    set({ currentConversationId: conv.id });
    notifyDbChange("conversations");
    return conv;
  },

  deleteConversation: async (id: string) => {
    await dbDeleteConversation(id);
    if (get().currentConversationId === id) {
      set({ currentConversationId: null });
    }
    notifyDbChange("conversations");
  },

  setCurrentConversation: (id: string | null) => {
    if (id !== get().currentConversationId) {
      set({
        currentConversationId: id,
        isGenerating: id ? _abortControllers.has(id) : false,
        streamingMessage: id ? (_streamingMessages.get(id) ?? null) : null,
      });
    }
  },

  sendMessage: async (
    text: string,
    images?: string[],
    options?: { reuseUserMessageId?: string; mentionedParticipantIds?: string[] },
  ) => {
    const convId = get().currentConversationId;
    if (!convId) return;
    const conv = await getConversation(convId);
    if (!conv) return;
    const cid: string = convId;

    // Create or reuse user message
    let userMsg: Message;
    if (options?.reuseUserMessageId) {
      const all = await getRecentMessages(convId, null, MAX_HISTORY);
      const existing = all.find((m) => m.id === options.reuseUserMessageId);
      if (!existing || existing.role !== "user") return;
      userMsg = existing;
    } else {
      userMsg = createUserMessage(generateId(), cid, text, images ?? [], get().activeBranchId);
      await insertMessage(userMsg);
      updateConversation(cid, { lastMessage: text, lastMessageAt: userMsg.createdAt }).catch(
        () => {},
      );
      notifyDbChange("messages", cid);
      notifyDbChange("conversations");
    }

    const abortController = new AbortController();
    _abortControllers.set(cid, abortController);
    if (cid === get().currentConversationId) set({ isGenerating: true });

    const targets = resolveTargetParticipants(conv, options?.mentionedParticipantIds);

    // Pre-compute compression summary once for group chats
    const cachedCompressionSummary = await preComputeCompression(
      cid,
      conv,
      targets,
      userMsg,
      abortController,
      get().activeBranchId,
    );
    const compressionSettings = useSettingsStore.getState().settings;

    // Build generation context
    const ctx = {
      cid,
      conversation: conv,
      userMsg,
      activeBranchId: get().activeBranchId,
      abortController,
      cachedCompressionSummary,
      compressionEnabled: compressionSettings.contextCompressionEnabled,
      compressionThreshold: compressionSettings.contextCompressionThreshold,
      streamingMessages: _streamingMessages,
      getCurrentConversationId: () => get().currentConversationId,
      setStoreState: (partial: { streamingMessage: StreamingState | null }) => set(partial),
    };

    try {
      for (let i = 0; i < targets.length; i++) {
        if (abortController.signal.aborted) break;
        await generateForParticipant(ctx, targets[i], i);
      }
    } finally {
      _abortControllers.delete(cid);
      _streamingMessages.delete(cid);
      if (cid === get().currentConversationId) {
        set({ isGenerating: false, streamingMessage: null });
      }
    }
  },

  stopGeneration: () => {
    const convId = get().currentConversationId;
    if (!convId) return;
    const ctrl = _abortControllers.get(convId);
    if (ctrl) {
      ctrl.abort();
      _abortControllers.delete(convId);
      set({ autoDiscussRemaining: 0 });
    }
  },

  startAutoDiscuss: async (rounds: number, topicText?: string) => {
    const convId = get().currentConversationId;
    if (!convId) return;

    const conv = await getConversation(convId);
    if (!conv || conv.type !== "group" || conv.participants.length < 2) return;

    set({ autoDiscussRemaining: rounds, autoDiscussTotalRounds: rounds });

    // Wait for any in-progress generation to finish before starting
    while (get().isGenerating) {
      await new Promise((r) => setTimeout(r, 300));
      if (get().autoDiscussRemaining <= 0) return; // stopped while waiting
    }

    const continuePrompt = i18n.t("chat.continue", { defaultValue: "Continue" });

    // Round 1: send topic if provided, otherwise the existing conversation counts as round 1
    if (topicText?.trim()) {
      await get().sendMessage(topicText.trim());
    }
    set({ autoDiscussRemaining: rounds - 1 });

    // Rounds 2..N: send continues
    for (let round = 1; round < rounds; round++) {
      if (get().autoDiscussRemaining <= 0) break;
      await get().sendMessage(continuePrompt);
      set({ autoDiscussRemaining: Math.max(0, rounds - round - 1) });
    }

    set({ autoDiscussRemaining: 0, autoDiscussTotalRounds: 0 });
  },

  stopAutoDiscuss: () => {
    set({ autoDiscussRemaining: 0 });
    get().stopGeneration();
  },

  regenerateMessage: async (messageId: string) => {
    const convId = get().currentConversationId;
    if (!convId || get().isGenerating) return;

    const messages = await getRecentMessages(convId, get().activeBranchId, MAX_HISTORY);
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant") return;

    // Find the user message before this assistant message
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    const prevUserMsg = messages
      .slice(0, msgIndex)
      .reverse()
      .find((m) => m.role === "user");
    if (!prevUserMsg) return;

    // Delete the old assistant message
    await dbDeleteMessage(messageId);
    notifyDbChange("messages", convId);

    // Re-generate assistant response without creating a duplicate user message
    await get().sendMessage(prevUserMsg.content, prevUserMsg.images, {
      reuseUserMessageId: prevUserMsg.id,
    });
  },

  editMessage: async (messageId: string, newContent: string) => {
    const convId = get().currentConversationId;
    if (!convId || get().isGenerating) return;

    const messages = await getRecentMessages(convId, get().activeBranchId, MAX_HISTORY);
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;
    const msg = messages[msgIndex];
    if (msg.role !== "user") return;

    await updateMessage(messageId, { content: newContent });

    // Delete all messages after the edited one
    const subsequent = messages.slice(msgIndex + 1);
    for (const m of subsequent) {
      await dbDeleteMessage(m.id);
    }
    notifyDbChange("messages", convId);

    // Re-generate AI response
    await get().sendMessage(newContent, msg.images, { reuseUserMessageId: messageId });
  },

  deleteMessageById: async (messageId: string) => {
    await dbDeleteMessage(messageId);
    const convId = get().currentConversationId;
    if (convId) notifyDbChange("messages", convId);
    else notifyDbChange("all");
  },

  clearConversationMessages: async (conversationId: string) => {
    await dbClearMessages(conversationId);
    await updateConversation(conversationId, { lastMessage: null, lastMessageAt: null });
    notifyDbChange("messages", conversationId);
    notifyDbChange("conversations");
  },

  updateParticipantIdentity: async (
    conversationId: string,
    participantId: string,
    identityId: string | null,
  ) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.map((p) =>
      p.id === participantId ? { ...p, identityId } : p,
    );
    await updateConversation(conversationId, { participants });
    notifyDbChange("conversations");
  },

  updateParticipantModel: async (
    conversationId: string,
    participantId: string,
    modelId: string,
  ) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const providerStore = useProviderStore.getState();
    const model = providerStore.getModelById(modelId);
    const participants = conv.participants.map((p) =>
      p.id === participantId ? { ...p, modelId } : p,
    );
    await updateConversation(conversationId, {
      participants,
      title: model?.displayName ?? conv.title,
    });
    notifyDbChange("conversations");
  },

  addParticipant: async (conversationId: string, modelId: string, identityId?: string | null) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const providerStore = useProviderStore.getState();
    const newParticipant: ConversationParticipant = {
      id: generateId(),
      modelId,
      identityId: identityId ?? null,
    };
    const participants = [...conv.participants, newParticipant];
    const becomesGroup = conv.type === "single" && participants.length > 1;
    const oldAutoTitle = autoTitle(conv.participants, providerStore);
    const isAutoTitle = becomesGroup || conv.title === oldAutoTitle;
    const updates: Partial<Conversation> = {
      participants,
      type: becomesGroup ? "group" : conv.type,
    };
    if (isAutoTitle) updates.title = autoTitle(participants, providerStore);
    await updateConversation(conversationId, updates);
    notifyDbChange("conversations");
  },

  addParticipants: async (
    conversationId: string,
    members: { modelId: string; identityId: string | null }[],
  ) => {
    const conv = await getConversation(conversationId);
    if (!conv || members.length === 0) return;
    const newParticipants: ConversationParticipant[] = members.map((m) => ({
      id: generateId(),
      modelId: m.modelId,
      identityId: m.identityId,
    }));
    const participants = [...conv.participants, ...newParticipants];
    const becomesGroup = conv.type === "single" && participants.length > 1;
    const providerStore = useProviderStore.getState();
    const oldAutoTitle = autoTitle(conv.participants, providerStore);
    const isAutoTitle = becomesGroup || conv.title === oldAutoTitle;
    const updates: Partial<Conversation> = {
      participants,
      type: becomesGroup ? "group" : conv.type,
    };
    if (isAutoTitle) updates.title = autoTitle(participants, providerStore);
    await updateConversation(conversationId, updates);
    notifyDbChange("conversations");
  },

  removeParticipant: async (conversationId: string, participantId: string) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.filter((p) => p.id !== participantId);
    const providerStore = useProviderStore.getState();
    const isAutoTitle = conv.title === autoTitle(conv.participants, providerStore);
    const updates: Partial<Conversation> = {
      participants,
      type: participants.length <= 1 ? "single" : "group",
    };
    if (isAutoTitle) updates.title = autoTitle(participants, providerStore);
    await updateConversation(conversationId, updates);
    notifyDbChange("conversations");
  },

  renameConversation: async (conversationId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await updateConversation(conversationId, { title: trimmed });
    notifyDbChange("conversations");
  },

  updateSpeakingOrder: async (conversationId: string, order) => {
    await updateConversation(conversationId, { speakingOrder: order });
    notifyDbChange("conversations");
  },

  reorderParticipants: async (conversationId: string, participantIds: string[]) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const idxMap = new Map(participantIds.map((id, i) => [id, i]));
    const sorted = [...conv.participants].sort(
      (a, b) => (idxMap.get(a.id) ?? 0) - (idxMap.get(b.id) ?? 0),
    );
    await updateConversation(conversationId, { participants: sorted });
    notifyDbChange("conversations");
  },

  branchFromMessage: async (messageId: string, messages: Message[]) => {
    const branchId = generateId();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return branchId;
    const branchedMessages = messages.slice(0, msgIndex + 1).map((m) => ({
      ...m,
      id: generateId(),
      branchId,
    }));
    await insertMessages(branchedMessages);
    set({ activeBranchId: branchId });
    const convId = get().currentConversationId;
    if (convId) notifyDbChange("messages", convId);
    return branchId;
  },

  switchBranch: (branchId: string | null) => {
    set({ activeBranchId: branchId });
  },

  searchAllMessages: async (query: string) => {
    const { searchMessages } = await import("../storage/database");
    return searchMessages(query);
  },
}));
