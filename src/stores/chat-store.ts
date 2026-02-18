import { create } from "zustand";
import type {
  Conversation,
  ConversationParticipant,
  Message,
} from "../types";
import {
  insertConversation,
  updateConversation as dbUpdateConversation,
  deleteConversation as dbDeleteConversation,
  getAllConversations,
  insertMessage,
  getMessages as dbGetMessages,
  searchMessages as dbSearchMessages,
  deleteMessage as dbDeleteMessage,
  clearMessages as dbClearMessages,
  insertMessages as dbInsertMessages,
} from "../storage/database";
import { generateId } from "../utils/id";
import { useProviderStore } from "./provider-store";
import { resolveTargetModels, generateResponse } from "../services/chat-service";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  streamingMessage: Message | null;
  isGenerating: boolean;
  activeBranchId: string | null;

  loadConversations: () => Promise<void>;
  createConversation: (
    type: "single" | "group",
    participants: ConversationParticipant[],
    title?: string,
  ) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  updateParticipantIdentity: (
    conversationId: string,
    modelId: string,
    identityId: string | null,
  ) => Promise<void>;

  commitStreamingMessage: () => void;
  sendMessage: (text: string, mentionedModelIds?: string[], images?: string[]) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  branchFromMessage: (messageId: string) => Promise<string>;
  switchBranch: (branchId: string | null) => void;
  deleteMessageById: (messageId: string) => Promise<void>;
  clearConversationMessages: (conversationId: string) => Promise<void>;
  searchAllMessages: (query: string) => Promise<Message[]>;
  /** @internal */
  _abortController: AbortController | null;
}

let loadSequence = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  streamingMessage: null,
  isGenerating: false,
  activeBranchId: null,
  _abortController: null,

  loadConversations: async () => {
    const conversations = await getAllConversations();
    set({ conversations });
  },

  createConversation: async (type, participants, title) => {
    const providerStore = useProviderStore.getState();
    const defaultTitle =
      title ??
      (type === "group"
        ? `Model Group (${participants.length})`
        : providerStore.getModelById(participants[0]?.modelId)?.displayName ??
          "New Chat");

    const conv: Conversation = {
      id: generateId(),
      type,
      title: defaultTitle,
      participants,
      lastMessage: null,
      lastMessageAt: null,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await insertConversation(conv);
    set({ conversations: [conv, ...get().conversations] });
    return conv;
  },

  deleteConversation: async (id) => {
    await dbDeleteConversation(id);
    const conversations = get().conversations.filter((c) => c.id !== id);
    set({
      conversations,
      currentConversationId:
        get().currentConversationId === id ? null : get().currentConversationId,
      messages: get().currentConversationId === id ? [] : get().messages,
    });
  },

  setCurrentConversation: (id) => {
    set({ currentConversationId: id, messages: [], streamingMessage: null, activeBranchId: null });
    if (id) get().loadMessages(id);
  },

  commitStreamingMessage: () => {
    const sm = get().streamingMessage;
    if (!sm) return;
    set((s) => ({
      messages: [...s.messages, sm],
      streamingMessage: null,
    }));
  },

  loadMessages: async (conversationId) => {
    const seq = ++loadSequence;
    const messages = await dbGetMessages(conversationId, get().activeBranchId);
    // P1-2: Discard stale results if user switched conversations during async load
    if (seq !== loadSequence) return;
    set({ messages });
  },

  updateParticipantIdentity: async (conversationId, modelId, identityId) => {
    const conv = get().conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const participants = conv.participants.map((p) =>
      p.modelId === modelId ? { ...p, identityId } : p,
    );
    await dbUpdateConversation(conversationId, { participants });

    const conversations = get().conversations.map((c) =>
      c.id === conversationId ? { ...c, participants } : c,
    );
    set({ conversations });
  },

  sendMessage: async (text, mentionedModelIds, images) => {
    const state = get();
    const convId = state.currentConversationId;
    if (!convId) return;

    const conv = state.conversations.find((c) => c.id === convId);
    if (!conv) return;

    const userMsg: Message = {
      id: generateId(),
      conversationId: convId,
      role: "user",
      senderModelId: null,
      senderName: "You",
      identityId: null,
      content: text,
      images: images ?? [],
      generatedImages: [],
      reasoningContent: null,
      reasoningDuration: null,
      toolCalls: [],
      toolResults: [],
      branchId: state.activeBranchId,
      parentMessageId: null,
      isStreaming: false,
      createdAt: new Date().toISOString(),
    };

    await insertMessage(userMsg);
    set({ messages: [...state.messages, userMsg], isGenerating: true });

    try {
      await dbUpdateConversation(convId, {
        lastMessage: text,
        lastMessageAt: userMsg.createdAt,
      });
      const conversations = get().conversations.map((c) =>
        c.id === convId
          ? { ...c, lastMessage: text, lastMessageAt: userMsg.createdAt, updatedAt: userMsg.createdAt }
          : c,
      );
      set({ conversations });

      const targetModelIds = resolveTargetModels(conv, mentionedModelIds);

      const abortController = new AbortController();
      set({ _abortController: abortController });

      for (const modelId of targetModelIds) {
        if (abortController.signal.aborted) break;
        await generateResponse(convId, modelId, conv, abortController.signal);
      }
    } finally {
      set({ _abortController: null, isGenerating: false });
    }
  },

  stopGeneration: () => {
    const ctrl = get()._abortController;
    if (ctrl) {
      ctrl.abort();
      set({ _abortController: null });
    }
  },

  regenerateMessage: async (messageId) => {
    const state = get();
    const convId = state.currentConversationId;
    if (!convId || state.isGenerating) return;

    const msg = state.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant" || !msg.senderModelId) return;

    const conv = state.conversations.find((c) => c.id === convId);
    if (!conv) return;

    // Delete the old assistant message
    await dbDeleteMessage(messageId);
    set({
      messages: state.messages.filter((m) => m.id !== messageId),
      isGenerating: true,
    });

    const abortController = new AbortController();
    set({ _abortController: abortController });

    try {
      await generateResponse(convId, msg.senderModelId, conv, abortController.signal);
    } finally {
      set({ _abortController: null, isGenerating: false });
    }
  },

  branchFromMessage: async (messageId) => {
    const branchId = generateId();
    const state = get();
    const msgIndex = state.messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return branchId;

    const branchedMessages = state.messages.slice(0, msgIndex + 1).map((m) => ({
      ...m,
      id: generateId(),
      branchId,
    }));

    await dbInsertMessages(branchedMessages);

    set({ activeBranchId: branchId });
    await get().loadMessages(get().currentConversationId!);
    return branchId;
  },

  switchBranch: (branchId) => {
    set({ activeBranchId: branchId });
    const convId = get().currentConversationId;
    if (convId) get().loadMessages(convId);
  },

  deleteMessageById: async (messageId) => {
    await dbDeleteMessage(messageId);
    const remaining = get().messages.filter((m) => m.id !== messageId);
    set({ messages: remaining });

    const convId = get().currentConversationId;
    if (convId) {
      const last = remaining[remaining.length - 1];
      const updates = {
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt ?? null,
      };
      await dbUpdateConversation(convId, updates);
      set({
        conversations: get().conversations.map((c) =>
          c.id === convId ? { ...c, ...updates } : c,
        ),
      });
    }
  },

  clearConversationMessages: async (conversationId) => {
    await dbClearMessages(conversationId);
    await dbUpdateConversation(conversationId, {
      lastMessage: null,
      lastMessageAt: null,
    });
    set({
      messages: get().currentConversationId === conversationId ? [] : get().messages,
      conversations: get().conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: null, lastMessageAt: null }
          : c,
      ),
    });
  },

  searchAllMessages: async (query) => {
    return dbSearchMessages(query);
  },
}));

