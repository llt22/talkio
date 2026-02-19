import { create } from "zustand";
import { InteractionManager } from "react-native";
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
  getRecentMessages as dbGetRecentMessages,
  getMessagesBefore as dbGetMessagesBefore,
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
  hasMoreMessages: boolean;
  isLoadingMore: boolean;

  loadConversations: () => Promise<void>;
  createConversation: (
    type: "single" | "group",
    participants: ConversationParticipant[],
    title?: string,
  ) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversation: (
    id: string | null,
    options?: {
      deferLoad?: boolean;
    },
  ) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
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

// P1: 使用 Map 存储每个对话的加载序列，避免全局竞争
const loadSequences = new Map<string, number>();

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  streamingMessage: null,
  isGenerating: false,
  activeBranchId: null,
  hasMoreMessages: true,
  isLoadingMore: false,
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

  setCurrentConversation: (id, options) => {
    // P2: 使用批量更新减少重渲染次数
    const updates: Partial<ChatState> = { currentConversationId: id };
    
    // 只有当切换对话时才清空消息
    if (id !== get().currentConversationId) {
      updates.messages = [];
      updates.streamingMessage = null;
      updates.activeBranchId = null;
      updates.hasMoreMessages = true;
      updates.isLoadingMore = false;
    }
    
    set(updates);
    if (id) {
      const load = () => get().loadMessages(id);
      if (options?.deferLoad) {
        InteractionManager.runAfterInteractions(load);
      } else {
        load();
      }
    }
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
    // P3: 使用对话特定的序列号，避免竞态条件
    const currentSeq = (loadSequences.get(conversationId) || 0) + 1;
    loadSequences.set(conversationId, currentSeq);
    
    const pageSize = 40;
    const messages = await dbGetRecentMessages(conversationId, get().activeBranchId, pageSize);
    
    // 检查是否是最新的请求
    if (loadSequences.get(conversationId) !== currentSeq) return;
    
    // P4: 只有当消息真正变化时才更新状态
    const currentMessages = get().messages;
    if (currentMessages.length !== messages.length || 
        JSON.stringify(currentMessages.map(m => m.id)) !== JSON.stringify(messages.map(m => m.id))) {
      set({
        messages,
        hasMoreMessages: messages.length === pageSize,
        isLoadingMore: false,
      });
    }
  },

  loadMoreMessages: async () => {
    const state = get();
    const convId = state.currentConversationId;
    if (!convId || state.isLoadingMore || !state.hasMoreMessages) return;
    if (state.messages.length === 0) {
      set({ hasMoreMessages: false, isLoadingMore: false });
      return;
    }

    const before = state.messages[0]?.createdAt;
    if (!before) return;

    set({ isLoadingMore: true });
    const pageSize = 40;
    const more = await dbGetMessagesBefore(convId, state.activeBranchId, before, pageSize);

    if (get().currentConversationId !== convId) {
      set({ isLoadingMore: false });
      return;
    }

    if (more.length === 0) {
      set({ hasMoreMessages: false, isLoadingMore: false });
      return;
    }

    set({
      messages: [...more, ...state.messages],
      hasMoreMessages: more.length === pageSize,
      isLoadingMore: false,
    });
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
      hasMoreMessages: get().currentConversationId === conversationId ? false : get().hasMoreMessages,
      isLoadingMore: false,
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

