/**
 * Chat Store — manages conversations and streaming SSE.
 * Uses SQLite for persistence + in-memory streaming state.
 * Generation logic extracted to chat-generation.ts.
 */
import { create } from "zustand";
import type { Message, Conversation, SpeakingOrder } from "../types";
import { getConversation } from "../storage/database";
import { type StreamingState } from "./chat-generation";
import { dispatchMessageGeneration, runAutoDiscuss } from "./chat-dispatch";
import {
  autoTitle,
  createConversationRecord,
  deleteConversationRecord,
  deleteAllConversationRecords,
  deriveConversationViewState,
  stopConversationGeneration,
} from "./chat-store-core";
import {
  addParticipant,
  addParticipants,
  branchFromMessage,
  clearConversationMessages,
  deleteMessageById,
  duplicateConversation,
  editUserMessage,
  regenerateAssistantMessage,
  removeParticipant,
  renameConversation,
  reorderParticipants,
  searchAllMessages,
  togglePinConversation,
  updateGroupSystemPrompt,
  updateParticipantIdentity,
  updateParticipantModel,
  updateSpeakingOrder,
} from "./chat-store-actions";

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
  streamingMessages: StreamingState[];

  createConversation: (
    modelId: string,
    extraModelIds?: string[],
    membersWithIdentity?: { modelId: string; identityId: string | null }[],
  ) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  deleteAllConversations: () => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  sendMessage: (
    text: string,
    images?: string[],
    options?: {
      reuseUserMessageId?: string;
      mentionedParticipantIds?: string[];
      targetParticipantIds?: string[];
    },
  ) => Promise<void>;
  stopGeneration: () => void;
  startAutoDiscuss: (rounds: number, topicText?: string) => Promise<void>;
  stopAutoDiscuss: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  duplicateConversation: (conversationId: string) => Promise<Conversation | null>;
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
  togglePinConversation: (conversationId: string) => Promise<void>;
  updateSpeakingOrder: (conversationId: string, order: SpeakingOrder) => Promise<void>;
  updateGroupSystemPrompt: (conversationId: string, prompt: string) => Promise<void>;
  reorderParticipants: (conversationId: string, participantIds: string[]) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversationId: null,
  isGenerating: false,
  activeBranchId: null,
  autoDiscussRemaining: 0,
  autoDiscussTotalRounds: 0,
  streamingMessages: [],

  createConversation: async (
    modelId: string,
    extraModelIds?: string[],
    membersWithIdentity?: { modelId: string; identityId: string | null }[],
  ) => {
    const conversation = await createConversationRecord(
      modelId,
      extraModelIds,
      membersWithIdentity,
    );
    set({ currentConversationId: conversation.id });
    return conversation;
  },

  deleteConversation: async (id: string) => {
    await deleteConversationRecord(id);
    if (get().currentConversationId === id) {
      set({ currentConversationId: null });
    }
  },

  deleteAllConversations: async () => {
    await deleteAllConversationRecords();
    set({ currentConversationId: null, activeBranchId: null });
  },

  setCurrentConversation: (id: string | null) => {
    const next = deriveConversationViewState(
      id,
      get().currentConversationId,
      _abortControllers,
      _streamingMessages,
    );
    if (next) set(next);
  },

  sendMessage: async (
    text: string,
    images?: string[],
    options?: {
      reuseUserMessageId?: string;
      mentionedParticipantIds?: string[];
      targetParticipantIds?: string[];
    },
  ) => {
    const conversationId = get().currentConversationId;
    if (!conversationId) return;
    await dispatchMessageGeneration({
      conversationId,
      text,
      images,
      options,
      activeBranchId: get().activeBranchId,
      getCurrentConversationId: () => get().currentConversationId,
      abortControllers: _abortControllers,
      streamingMessages: _streamingMessages,
      setStoreState: (partial) => set(partial),
    });
  },

  stopGeneration: () => {
    const next = stopConversationGeneration(get().currentConversationId, _abortControllers);
    if (next) set(next);
  },

  startAutoDiscuss: async (rounds: number, topicText?: string) => {
    await runAutoDiscuss({
      rounds,
      topicText,
      currentConversationId: get().currentConversationId,
      isGenerating: () => get().isGenerating,
      autoDiscussRemaining: () => get().autoDiscussRemaining,
      setStoreState: (partial) => set(partial),
      sendMessage: get().sendMessage,
    });
  },

  stopAutoDiscuss: () => {
    set({ autoDiscussRemaining: 0 });
    get().stopGeneration();
  },

  regenerateMessage: async (messageId: string) => {
    await regenerateAssistantMessage(
      get().currentConversationId ?? "",
      get().activeBranchId,
      get().isGenerating,
      messageId,
      get().sendMessage,
    );
  },

  duplicateConversation: async (conversationId: string) => {
    const conversation = await duplicateConversation(conversationId);
    if (conversation) set({ currentConversationId: conversation.id, activeBranchId: null });
    return conversation;
  },

  editMessage: async (messageId: string, newContent: string) => {
    await editUserMessage(
      get().currentConversationId ?? "",
      get().activeBranchId,
      get().isGenerating,
      messageId,
      newContent,
      get().sendMessage,
    );
  },

  deleteMessageById: async (messageId: string) => {
    await deleteMessageById(messageId, get().currentConversationId);
  },

  clearConversationMessages: async (conversationId: string) => {
    await clearConversationMessages(conversationId);
  },

  updateParticipantIdentity: async (
    conversationId: string,
    participantId: string,
    identityId: string | null,
  ) => {
    await updateParticipantIdentity(conversationId, participantId, identityId);
  },

  updateParticipantModel: async (
    conversationId: string,
    participantId: string,
    modelId: string,
  ) => {
    await updateParticipantModel(conversationId, participantId, modelId);
  },

  addParticipant: async (conversationId: string, modelId: string, identityId?: string | null) => {
    await addParticipant(conversationId, modelId, identityId);
  },

  addParticipants: async (
    conversationId: string,
    members: { modelId: string; identityId: string | null }[],
  ) => {
    await addParticipants(conversationId, members);
  },

  removeParticipant: async (conversationId: string, participantId: string) => {
    await removeParticipant(conversationId, participantId);
  },

  renameConversation: async (conversationId: string, title: string) => {
    await renameConversation(conversationId, title);
  },

  togglePinConversation: async (conversationId: string) => {
    await togglePinConversation(conversationId);
  },

  updateSpeakingOrder: async (conversationId: string, order) => {
    await updateSpeakingOrder(conversationId, order);
  },

  updateGroupSystemPrompt: async (conversationId: string, prompt: string) => {
    await updateGroupSystemPrompt(conversationId, prompt);
  },

  reorderParticipants: async (conversationId: string, participantIds: string[]) => {
    await reorderParticipants(conversationId, participantIds);
  },

  branchFromMessage: async (messageId: string, messages: Message[]) => {
    return branchFromMessage(
      messageId,
      messages,
      (branchId) => set({ activeBranchId: branchId }),
      get().currentConversationId,
    );
  },

  switchBranch: (branchId: string | null) => {
    set({ activeBranchId: branchId });
  },

  searchAllMessages: async (query: string) => {
    return searchAllMessages(query);
  },
}));
