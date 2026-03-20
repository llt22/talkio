import type { Conversation, ConversationParticipant, Message, SpeakingOrder } from "../types";
import {
  clearMessages as dbClearMessages,
  deleteMessage as dbDeleteMessage,
  getConversation,
  getRecentMessages,
  insertMessages,
  insertConversation,
  updateConversation,
  updateMessage,
} from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { useProviderStore } from "./provider-store";
import { generateId } from "../lib/id";
import { autoTitle } from "./chat-store-core";

export async function regenerateAssistantMessage(
  conversationId: string,
  activeBranchId: string | null,
  isGenerating: boolean,
  messageId: string,
  resend: (
    content: string,
    images?: string[],
    options?: {
      reuseUserMessageId?: string;
      mentionedParticipantIds?: string[];
      targetParticipantIds?: string[];
    },
  ) => Promise<void>,
): Promise<void> {
  if (!conversationId || isGenerating) return;
  const messages = await getRecentMessages(conversationId, activeBranchId, 200);
  const message = messages.find((item) => item.id === messageId);
  if (!message || message.role !== "assistant") return;

  const messageIndex = messages.findIndex((item) => item.id === messageId);
  const previousUserMessage = messages
    .slice(0, messageIndex)
    .reverse()
    .find((item) => item.role === "user");
  if (!previousUserMessage) return;

  await dbDeleteMessage(messageId);
  notifyDbChange("messages", conversationId);

  await resend(previousUserMessage.content, previousUserMessage.images, {
    reuseUserMessageId: previousUserMessage.id,
    targetParticipantIds: message.participantId ? [message.participantId] : undefined,
  });
}

export async function editUserMessage(
  conversationId: string,
  activeBranchId: string | null,
  isGenerating: boolean,
  messageId: string,
  newContent: string,
  resend: (
    content: string,
    images?: string[],
    options?: {
      reuseUserMessageId?: string;
      mentionedParticipantIds?: string[];
      targetParticipantIds?: string[];
    },
  ) => Promise<void>,
): Promise<void> {
  if (!conversationId || isGenerating) return;

  const messages = await getRecentMessages(conversationId, activeBranchId, 200);
  const messageIndex = messages.findIndex((item) => item.id === messageId);
  if (messageIndex < 0) return;

  const message = messages[messageIndex];
  if (message.role !== "user") return;

  await updateMessage(messageId, { content: newContent });

  const subsequentMessages = messages.slice(messageIndex + 1);
  for (const subsequentMessage of subsequentMessages) {
    await dbDeleteMessage(subsequentMessage.id);
  }
  notifyDbChange("messages", conversationId);

  await resend(newContent, message.images, { reuseUserMessageId: messageId });
}

export async function deleteMessageById(
  messageId: string,
  conversationId: string | null,
): Promise<void> {
  await dbDeleteMessage(messageId);
  if (conversationId) notifyDbChange("messages", conversationId);
  else notifyDbChange("all");
}

export async function clearConversationMessages(conversationId: string): Promise<void> {
  await dbClearMessages(conversationId);
  await updateConversation(conversationId, { lastMessage: null, lastMessageAt: null });
  notifyDbChange("messages", conversationId);
  notifyDbChange("conversations");
}

export async function updateParticipantIdentity(
  conversationId: string,
  participantId: string,
  identityId: string | null,
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return;
  const participants = conversation.participants.map((participant) =>
    participant.id === participantId ? { ...participant, identityId } : participant,
  );
  await updateConversation(conversationId, { participants });
  notifyDbChange("conversations");
}

export async function updateParticipantModel(
  conversationId: string,
  participantId: string,
  modelId: string,
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return;
  const providerStore = useProviderStore.getState();
  const model = providerStore.getModelById(modelId);
  const participants = conversation.participants.map((participant) =>
    participant.id === participantId ? { ...participant, modelId } : participant,
  );
  await updateConversation(conversationId, {
    participants,
    title: model?.displayName ?? conversation.title,
  });
  notifyDbChange("conversations");
}

export async function addParticipant(
  conversationId: string,
  modelId: string,
  identityId?: string | null,
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return;

  const newParticipant: ConversationParticipant = {
    id: generateId(),
    modelId,
    identityId: identityId ?? null,
  };
  const participants = [...conversation.participants, newParticipant];
  const becomesGroup = conversation.type === "single" && participants.length > 1;
  const oldAutoTitle = autoTitle(conversation.participants);
  const isAutoTitle = becomesGroup || conversation.title === oldAutoTitle;
  const updates: Partial<Conversation> = {
    participants,
    type: becomesGroup ? "group" : conversation.type,
  };
  if (isAutoTitle) updates.title = autoTitle(participants);
  await updateConversation(conversationId, updates);
  notifyDbChange("conversations");
}

export async function addParticipants(
  conversationId: string,
  members: { modelId: string; identityId: string | null }[],
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation || members.length === 0) return;

  const newParticipants: ConversationParticipant[] = members.map((member) => ({
    id: generateId(),
    modelId: member.modelId,
    identityId: member.identityId,
  }));
  const participants = [...conversation.participants, ...newParticipants];
  const becomesGroup = conversation.type === "single" && participants.length > 1;
  const oldAutoTitle = autoTitle(conversation.participants);
  const isAutoTitle = becomesGroup || conversation.title === oldAutoTitle;
  const updates: Partial<Conversation> = {
    participants,
    type: becomesGroup ? "group" : conversation.type,
  };
  if (isAutoTitle) updates.title = autoTitle(participants);
  await updateConversation(conversationId, updates);
  notifyDbChange("conversations");
}

export async function removeParticipant(
  conversationId: string,
  participantId: string,
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return;
  const participants = conversation.participants.filter(
    (participant) => participant.id !== participantId,
  );
  const isAutoTitle = conversation.title === autoTitle(conversation.participants);
  const updates: Partial<Conversation> = {
    participants,
    type: participants.length <= 1 ? "single" : "group",
  };
  if (isAutoTitle) updates.title = autoTitle(participants);
  await updateConversation(conversationId, updates);
  notifyDbChange("conversations");
}

export async function renameConversation(conversationId: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  await updateConversation(conversationId, { title: trimmed });
  notifyDbChange("conversations");
}

export async function updateSpeakingOrder(
  conversationId: string,
  order: SpeakingOrder,
): Promise<void> {
  await updateConversation(conversationId, { speakingOrder: order });
  notifyDbChange("conversations");
}

export async function updateGroupSystemPrompt(
  conversationId: string,
  prompt: string,
): Promise<void> {
  await updateConversation(conversationId, { groupSystemPrompt: prompt });
  notifyDbChange("conversations");
}

export async function reorderParticipants(
  conversationId: string,
  participantIds: string[],
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return;
  const indexMap = new Map(participantIds.map((id, index) => [id, index]));
  const sorted = [...conversation.participants].sort(
    (left, right) => (indexMap.get(left.id) ?? 0) - (indexMap.get(right.id) ?? 0),
  );
  await updateConversation(conversationId, { participants: sorted });
  notifyDbChange("conversations");
}

export async function branchFromMessage(
  messageId: string,
  messages: Message[],
  setActiveBranchId: (branchId: string) => void,
  currentConversationId: string | null,
): Promise<string> {
  const branchId = generateId();
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  if (messageIndex < 0) return branchId;
  const branchedMessages = messages.slice(0, messageIndex + 1).map((message) => ({
    ...message,
    id: generateId(),
    branchId,
  }));
  await insertMessages(branchedMessages);
  setActiveBranchId(branchId);
  if (currentConversationId) notifyDbChange("messages", currentConversationId);
  return branchId;
}

export async function searchAllMessages(query: string): Promise<Message[]> {
  const { searchMessages } = await import("../storage/database");
  return searchMessages(query);
}

export async function duplicateConversation(conversationId: string): Promise<Conversation | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  const duplicated: Conversation = {
    ...conversation,
    id: generateId(),
    participants: conversation.participants.map((participant) => ({
      ...participant,
      id: generateId(),
    })),
    lastMessage: null,
    lastMessageAt: null,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await insertConversation(duplicated);
  notifyDbChange("conversations");
  return duplicated;
}
