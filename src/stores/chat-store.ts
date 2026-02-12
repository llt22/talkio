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
} from "../storage/database";
import { generateId } from "../utils/id";
import { useProviderStore } from "./provider-store";
import { resolveTargetModels, generateResponse } from "../services/chat-service";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
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

  sendMessage: (text: string, mentionedModelIds?: string[]) => Promise<void>;
  branchFromMessage: (messageId: string) => Promise<string>;
  switchBranch: (branchId: string | null) => void;
  deleteMessageById: (messageId: string) => Promise<void>;
  searchAllMessages: (query: string) => Promise<Message[]>;
}

let loadSequence = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isGenerating: false,
  activeBranchId: null,

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
    set({ currentConversationId: id, messages: [], activeBranchId: null });
    if (id) get().loadMessages(id);
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

  sendMessage: async (text, mentionedModelIds) => {
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

      for (const modelId of targetModelIds) {
        await generateResponse(convId, modelId, conv);
      }
    } finally {
      set({ isGenerating: false });
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

    for (const msg of branchedMessages) {
      await insertMessage(msg);
    }

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

  searchAllMessages: async (query) => {
    return dbSearchMessages(query);
  },
}));

