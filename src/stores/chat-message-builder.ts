/**
 * Chat message building utilities — extracted from chat-store.ts.
 * Pure functions for constructing API messages from conversation state.
 */
import type { Message, Conversation, ConversationParticipant } from "../types";
import { MessageStatus } from "../types";
import { useProviderStore } from "./provider-store";
import { useIdentityStore } from "./identity-store";

/**
 * Determine which participants should respond to a message.
 */
export function resolveTargetParticipants(
  conv: Conversation,
  mentionedModelIds?: string[],
): ConversationParticipant[] {
  if (conv.type === "single") {
    return conv.participants[0] ? [conv.participants[0]] : [];
  }
  if (mentionedModelIds && mentionedModelIds.length > 0) {
    const mentionedSet = new Set(mentionedModelIds);
    return conv.participants.filter((p) => mentionedSet.has(p.modelId));
  }
  return conv.participants;
}

/**
 * Build a group chat roster string that explains the participants to each AI.
 */
export function buildGroupRoster(
  conv: Conversation,
  selfParticipantId: string | null,
): string {
  const providerStore = useProviderStore.getState();
  const identityStore = useIdentityStore.getState();
  const lines = conv.participants.map((p) => {
    const model = providerStore.getModelById(p.modelId);
    const modelName = model?.displayName ?? p.modelId;
    const identity = p.identityId ? identityStore.getIdentityById(p.identityId) : null;
    const label = identity?.name ?? modelName;
    const isSelf = p.id === selfParticipantId;
    return `- ${label}${isSelf ? "  ← you" : ""}`;
  });
  return [
    "You are in a group chat with multiple AI participants and one human user.",
    "Participants:",
    ...lines,
    "",
    "The human user's messages appear as: [User said]: content",
    "Other AI participants' messages appear as: [Name said]: content",
    "Your own previous messages appear as role=assistant (no prefix).",
    "Always distinguish between the human user and other AI participants.",
    "Think independently — form your own opinions and do not simply agree with or echo others.",
    "If you disagree, say so directly and explain why. Constructive debate is encouraged.",
    "Do not repeat, summarize, or rephrase what others said unless asked.",
  ].join("\n");
}

/**
 * Build the API messages array for a specific participant,
 * applying system prompts, group roster, and role mapping.
 */
export function buildApiMessagesForParticipant(
  allMessages: Message[],
  participant: ConversationParticipant,
  conv: Conversation,
): Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }> {
  const identity = participant.identityId
    ? useIdentityStore.getState().getIdentityById(participant.identityId)
    : null;

  const isGroup = conv.type === "group";
  const apiMessages: Array<{ role: string; content: unknown }> = [];

  if (isGroup) {
    const roster = buildGroupRoster(conv, participant.id);
    const groupPrompt = identity?.systemPrompt ? `${identity.systemPrompt}\n\n${roster}` : roster;
    apiMessages.push({ role: "system", content: groupPrompt });
  } else if (identity?.systemPrompt) {
    apiMessages.push({ role: "system", content: identity.systemPrompt });
  }

  for (const m of allMessages) {
    if (m.role !== "user" && m.role !== "assistant") continue;

    let role: "user" | "assistant" = m.role as "user" | "assistant";
    let content: unknown = m.content;

    if (m.role === "user") {
      if (m.images && m.images.length > 0) {
        const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const uri of m.images) {
          parts.push({ type: "image_url", image_url: { url: uri } });
        }
        content = parts;
      }
    }

    if (isGroup) {
      if (role === "user" && typeof content === "string") {
        content = `[User said]: ${content}`;
      }
      if (role === "assistant" && m.senderName) {
        const isSelf = m.participantId != null && m.participantId === participant.id;
        if (!isSelf) {
          role = "user";
          const prefix = `[${m.senderName} said]: `;
          if (typeof content === "string") content = prefix + content;
        }
      }
    }

    apiMessages.push({ role, content });
  }

  return apiMessages;
}

/**
 * Create a new user Message object.
 */
export function createUserMessage(
  id: string,
  conversationId: string,
  text: string,
  images: string[],
  branchId: string | null,
): Message {
  return {
    id,
    conversationId,
    role: "user",
    senderModelId: null,
    senderName: "You",
    identityId: null,
    participantId: null,
    content: text,
    images,
    generatedImages: [],
    reasoningContent: null,
    reasoningDuration: null,
    toolCalls: [],
    toolResults: [],
    branchId,
    parentMessageId: null,
    isStreaming: false,
    status: MessageStatus.SUCCESS,
    errorMessage: null,
    tokenUsage: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a new assistant Message object (initial skeleton before streaming).
 */
export function createAssistantMessage(
  id: string,
  conversationId: string,
  modelId: string,
  senderName: string,
  participantId: string,
  identityId: string | null,
  branchId: string | null,
  createdAt: string,
): Message {
  return {
    id,
    conversationId,
    role: "assistant",
    senderModelId: modelId,
    senderName,
    identityId,
    participantId,
    content: "",
    images: [],
    generatedImages: [],
    reasoningContent: null,
    reasoningDuration: null,
    toolCalls: [],
    toolResults: [],
    branchId,
    parentMessageId: null,
    isStreaming: true,
    status: MessageStatus.STREAMING,
    errorMessage: null,
    tokenUsage: null,
    createdAt,
  };
}
