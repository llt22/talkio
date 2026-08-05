import type { Conversation, ConversationParticipant } from "../types";
import {
  deleteConversation as dbDeleteConversation,
  deleteAllConversations as dbDeleteAllConversations,
  insertConversation,
} from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { useProviderStore } from "./provider-store";
import { generateId } from "../lib/id";
import i18n from "../i18n";
import type { StreamingState } from "./chat-generation";

export function autoTitle(participants: ConversationParticipant[]): string {
  const providerStore = useProviderStore.getState();
  const names = participants.map(
    (participant) =>
      providerStore.getModelById(participant.modelId)?.displayName ?? participant.modelId,
  );
  if (names.length <= 1) return names[0] ?? "";
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")}...`;
}

export async function createConversationRecord(
  modelId: string,
  extraModelIds?: string[],
  membersWithIdentity?: { modelId: string; identityId: string | null }[],
): Promise<Conversation> {
  const providerStore = useProviderStore.getState();
  const model = providerStore.getModelById(modelId);
  let participants: ConversationParticipant[];

  if (membersWithIdentity && membersWithIdentity.length > 0) {
    participants = membersWithIdentity.map((member) => ({
      id: generateId(),
      modelId: member.modelId,
      identityId: member.identityId,
    }));
  } else {
    const allIds = [modelId, ...(extraModelIds ?? [])];
    participants = allIds.map((id) => ({
      id: generateId(),
      modelId: id,
      identityId: null,
    }));
  }

  const isGroup = participants.length > 1;
  const conversation: Conversation = {
    id: generateId(),
    type: isGroup ? "group" : "single",
    title: isGroup
      ? autoTitle(participants)
      : (model?.displayName ?? i18n.t("chats.newChat", { defaultValue: "New Chat" })),
    participants,
    lastMessage: null,
    lastMessageAt: null,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await insertConversation(conversation);
  notifyDbChange("conversations");
  return conversation;
}

export async function deleteConversationRecord(id: string): Promise<void> {
  await dbDeleteConversation(id);
  notifyDbChange("conversations");
}

export async function deleteAllConversationRecords(): Promise<void> {
  await dbDeleteAllConversations();
  notifyDbChange("all");
}

export function deriveConversationViewState(
  id: string | null,
  currentConversationId: string | null,
  abortControllers: Map<string, AbortController>,
  streamingMessages: Map<string, StreamingState>,
): {
  currentConversationId: string | null;
  isGenerating: boolean;
  streamingMessages: StreamingState[];
} | null {
  if (id === currentConversationId) return null;
  return {
    currentConversationId: id,
    isGenerating: id ? abortControllers.has(id) : false,
    streamingMessages: id
      ? Array.from(streamingMessages.values()).filter((state) => state.cid === id)
      : [],
  };
}

export function stopConversationGeneration(
  currentConversationId: string | null,
  abortControllers: Map<string, AbortController>,
): { autoDiscussRemaining: number } | null {
  if (!currentConversationId) return null;
  const controller = abortControllers.get(currentConversationId);
  if (!controller) return null;
  controller.abort();
  return { autoDiscussRemaining: 0 };
}

export function clearConversationRuntime(
  conversationId: string,
  currentConversationId: string | null,
  abortControllers: Map<string, AbortController>,
  streamingMessages: Map<string, StreamingState>,
): { isGenerating: false; streamingMessages: StreamingState[] } | null {
  abortControllers.get(conversationId)?.abort();
  abortControllers.delete(conversationId);

  for (const [messageId, state] of streamingMessages) {
    if (state.cid === conversationId) streamingMessages.delete(messageId);
  }

  if (conversationId !== currentConversationId) return null;
  return { isGenerating: false, streamingMessages: [] };
}
