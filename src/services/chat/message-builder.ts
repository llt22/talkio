import type {
  Conversation,
  ConversationParticipant,
  Message,
  ChatApiMessage,
  Identity,
} from "../../types";
import { fileToDataUri } from "../../utils/image-storage";
import { logger } from "../logger";

const log = logger.withContext("MessageBuilder");

export function resolveTargetParticipants(
  conv: Conversation,
  mentionedModelIds?: string[],
): ConversationParticipant[] {
  if (conv.type === "single") {
    if (!conv.participants[0]) return [];
    return [conv.participants[0]];
  }
  if (mentionedModelIds && mentionedModelIds.length > 0) {
    const mentionedSet = new Set(mentionedModelIds);
    return conv.participants.filter((p) => mentionedSet.has(p.modelId));
  }
  return conv.participants;
}

export async function buildApiMessages(
  messages: Message[],
  targetModelId: string,
  identity: Identity | undefined,
  targetIdentityId?: string | null,
  conv?: { participants: { modelId: string }[] },
): Promise<ChatApiMessage[]> {
  const apiMessages: ChatApiMessage[] = [];

  if (identity) {
    apiMessages.push({ role: "system", content: identity.systemPrompt });
  }

  // Check if the same model appears multiple times in the conversation
  const hasDuplicateModels = conv
    ? conv.participants.filter((p) => p.modelId === targetModelId).length > 1
    : false;

  for (const msg of messages) {
    if (msg.role === "system") continue;

    const hasImages = msg.images && msg.images.length > 0;

    let content: ChatApiMessage["content"];
    if (hasImages) {
      // Convert file:// URIs to data URIs for the API
      const imageParts = await Promise.all(
        msg.images.map(async (uri) => ({
          type: "image_url" as const,
          image_url: { url: await fileToDataUri(uri) },
        })),
      );
      content = [
        ...(msg.content ? [{ type: "text" as const, text: msg.content }] : []),
        ...imageParts,
      ];
    } else {
      content = msg.content;
    }

    const apiMsg: ChatApiMessage = { role: msg.role, content };

    if (msg.role === "assistant" && msg.senderName) {
      // Determine if this message is from "self" (same participant) or "other".
      let isSelf: boolean;
      if (msg.senderModelId !== targetModelId) {
        // Different model — definitely not self
        isSelf = false;
      } else if (hasDuplicateModels) {
        // Same model appears multiple times — use identityId to distinguish.
        // Both null identities with same model = ambiguous, treat as other
        // to ensure each participant gets its own turn.
        const msgIdentity = msg.identityId ?? null;
        const targetIdentity = targetIdentityId ?? null;
        isSelf = msgIdentity !== null && msgIdentity === targetIdentity;
      } else {
        // Single instance of this model — it's self
        isSelf = true;
      }

      if (!isSelf) {
        // Convert other participants' responses to "user" role
        apiMsg.role = "user";
        const prefix = `[${msg.senderName} said]: `;
        if (typeof apiMsg.content === "string") {
          apiMsg.content = prefix + apiMsg.content;
        }
      }
    }

    apiMessages.push(apiMsg);
  }

  return apiMessages;
}

