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
): Promise<ChatApiMessage[]> {
  const apiMessages: ChatApiMessage[] = [];

  if (identity) {
    apiMessages.push({ role: "system", content: identity.systemPrompt });
  }

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

    if (msg.role === "assistant" && msg.senderModelId !== targetModelId && msg.senderName) {
      // Convert other models' responses to "user" role to avoid "must end with user message" errors
      apiMsg.role = "user";
      const prefix = `[${msg.senderName} said]: `;
      if (typeof apiMsg.content === "string") {
        apiMsg.content = prefix + apiMsg.content;
      }
    }

    apiMessages.push(apiMsg);
  }

  return apiMessages;
}

