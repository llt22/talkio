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
  insertMessage,
  getConversation as dbGetConversation,
  getRecentMessages as dbGetRecentMessages,
  searchMessages as dbSearchMessages,
  deleteMessage as dbDeleteMessage,
  clearMessages as dbClearMessages,
  insertMessages as dbInsertMessages,
} from "../storage/database";
import { generateId } from "../utils/id";
import { useProviderStore } from "./provider-store";
import { resolveTargetModels, generateResponse } from "../services/chat-service";

// DB-driven architecture: messages and conversations are read via useLiveQuery hooks.
// This store only holds ephemeral UI state and action methods that write to DB.
interface ChatState {
  currentConversationId: string | null;
  isGenerating: boolean;
  activeBranchId: string | null;
  /** @internal */
  _abortController: AbortController | null;

  createConversation: (
    type: "single" | "group",
    participants: ConversationParticipant[],
    title?: string,
  ) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  updateParticipantIdentity: (
    conversationId: string,
    modelId: string,
    identityId: string | null,
  ) => Promise<void>;
  addParticipant: (conversationId: string, modelId: string) => Promise<void>;
  removeParticipant: (conversationId: string, modelId: string) => Promise<void>;
  sendMessage: (text: string, mentionedModelIds?: string[], images?: string[]) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  branchFromMessage: (messageId: string, messages: Message[]) => Promise<string>;
  switchBranch: (branchId: string | null) => void;
  deleteMessageById: (messageId: string) => Promise<void>;
  clearConversationMessages: (conversationId: string) => Promise<void>;
  searchAllMessages: (query: string) => Promise<Message[]>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversationId: null,
  isGenerating: false,
  activeBranchId: null,
  _abortController: null,

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
    // useLiveQuery in useConversations will auto-update the list
    return conv;
  },

  deleteConversation: async (id) => {
    await dbDeleteConversation(id);
    // useLiveQuery auto-updates; clear currentConversationId if needed
    if (get().currentConversationId === id) {
      set({ currentConversationId: null, activeBranchId: null });
    }
  },

  setCurrentConversation: (id) => {
    if (id !== get().currentConversationId) {
      set({ currentConversationId: id, activeBranchId: null });
    }
  },

  updateParticipantIdentity: async (conversationId, modelId, identityId) => {
    const conv = await dbGetConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.map((p) =>
      p.modelId === modelId ? { ...p, identityId } : p,
    );
    await dbUpdateConversation(conversationId, { participants });
    // useLiveQuery auto-updates
  },

  addParticipant: async (conversationId, modelId) => {
    const conv = await dbGetConversation(conversationId);
    if (!conv) return;
    if (conv.participants.some((p) => p.modelId === modelId)) return;
    const participants = [...conv.participants, { modelId, identityId: null }];
    const titleUpdate = /^Model Group \(\d+\)$/.test(conv.title)
      ? { title: `Model Group (${participants.length})` }
      : {};
    await dbUpdateConversation(conversationId, { participants, ...titleUpdate });
  },

  removeParticipant: async (conversationId, modelId) => {
    const conv = await dbGetConversation(conversationId);
    if (!conv) return;
    if (conv.participants.length <= 1) return;
    const participants = conv.participants.filter((p) => p.modelId !== modelId);
    const titleUpdate = /^Model Group \(\d+\)$/.test(conv.title)
      ? { title: `Model Group (${participants.length})` }
      : {};
    await dbUpdateConversation(conversationId, { participants, ...titleUpdate });
  },

  sendMessage: async (text, mentionedModelIds, images) => {
    const convId = get().currentConversationId;
    if (!convId) return;

    const conv = await dbGetConversation(convId);
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
      branchId: get().activeBranchId,
      parentMessageId: null,
      isStreaming: false,
      createdAt: new Date().toISOString(),
    };

    // Write to DB — useLiveQuery auto-updates UI
    await insertMessage(userMsg);
    dbUpdateConversation(convId, {
      lastMessage: text,
      lastMessageAt: userMsg.createdAt,
    }).catch(() => {});

    set({ isGenerating: true });

    try {
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
    const convId = get().currentConversationId;
    if (!convId || get().isGenerating) return;

    // Read from DB to get message details
    const allMessages = await dbGetRecentMessages(convId, get().activeBranchId, 200);
    const msg = allMessages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant" || !msg.senderModelId) return;

    const conv = await dbGetConversation(convId);
    if (!conv) return;

    // Delete the old assistant message from DB — useLiveQuery auto-updates
    await dbDeleteMessage(messageId);
    set({ isGenerating: true });

    const abortController = new AbortController();
    set({ _abortController: abortController });

    try {
      await generateResponse(convId, msg.senderModelId, conv, abortController.signal);
    } finally {
      set({ _abortController: null, isGenerating: false });
    }
  },

  branchFromMessage: async (messageId, messages) => {
    const branchId = generateId();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return branchId;

    const branchedMessages = messages.slice(0, msgIndex + 1).map((m) => ({
      ...m,
      id: generateId(),
      branchId,
    }));

    await dbInsertMessages(branchedMessages);
    set({ activeBranchId: branchId });
    // useLiveQuery with new branchId will auto-load the branched messages
    return branchId;
  },

  switchBranch: (branchId) => {
    set({ activeBranchId: branchId });
    // useLiveQuery reacts to branchId change in the component
  },

  deleteMessageById: async (messageId) => {
    // Delete from DB — useLiveQuery auto-updates
    await dbDeleteMessage(messageId);
    // Update conversation lastMessage metadata
    const convId = get().currentConversationId;
    if (convId) {
      const remaining = await dbGetRecentMessages(convId, get().activeBranchId, 1);
      const last = remaining[remaining.length - 1];
      dbUpdateConversation(convId, {
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt ?? null,
      }).catch(() => {});
    }
  },

  clearConversationMessages: async (conversationId) => {
    await dbClearMessages(conversationId);
    await dbUpdateConversation(conversationId, {
      lastMessage: null,
      lastMessageAt: null,
    });
    // useLiveQuery auto-updates both messages and conversations
  },

  searchAllMessages: async (query) => {
    return dbSearchMessages(query);
  },
}));
