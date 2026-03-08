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
  mentionedParticipantIds?: string[],
): ConversationParticipant[] {
  if (conv.type === "single") {
    return conv.participants[0] ? [conv.participants[0]] : [];
  }
  let targets: ConversationParticipant[];
  if (mentionedParticipantIds && mentionedParticipantIds.length > 0) {
    const mentionedSet = new Set(mentionedParticipantIds);
    targets = conv.participants.filter((p) => mentionedSet.has(p.id));
  } else {
    targets = [...conv.participants];
  }
  if (conv.speakingOrder === "random") {
    // Fisher-Yates shuffle
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
  }
  return targets;
}

/**
 * Get a display label for a participant, adding #N suffix for duplicate models.
 */
export function getParticipantLabel(
  participant: ConversationParticipant,
  allParticipants: ConversationParticipant[],
): string {
  const providerStore = useProviderStore.getState();
  const identityStore = useIdentityStore.getState();
  const model = providerStore.getModelById(participant.modelId);
  const modelName = model?.displayName ?? participant.modelId;
  const identity = participant.identityId
    ? identityStore.getIdentityById(participant.identityId)
    : null;

  if (identity?.name) {
    return `${modelName}（${identity.name}）`;
  }

  const sameModelParticipants = allParticipants.filter((p) => p.modelId === participant.modelId);
  if (sameModelParticipants.length > 1) {
    const index = sameModelParticipants.findIndex((p) => p.id === participant.id);
    return `${modelName} #${index + 1}`;
  }

  return modelName;
}

/**
 * Build a group chat roster string that explains the participants to each AI.
 */
export function buildGroupRoster(conv: Conversation, selfParticipantId: string | null): string {
  const lines = conv.participants.map((p) => {
    const label = getParticipantLabel(p, conv.participants);
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
 * Extract @mentioned participant IDs from AI response content.
 * Matches @ModelDisplayName patterns against conversation participants.
 */
export function extractMentionedParticipants(
  content: string,
  conv: Conversation,
  selfParticipantId: string,
): string[] {
  const mentioned = new Set<string>();
  for (const p of conv.participants) {
    if (p.id === selfParticipantId) continue;
    const label = getParticipantLabel(p, conv.participants);
    if (content.includes(`@${label}`)) {
      mentioned.add(p.id);
    }
  }
  return [...mentioned];
}

/**
 * Build the API messages array for a specific participant,
 * applying system prompts, group roster, and role mapping.
 */
export function buildApiMessagesForParticipant(
  allMessages: Message[],
  participant: ConversationParticipant,
  conv: Conversation,
  options?: {
    workspaceTree?: string;
    workspaceFiles?: Array<{ path: string; content: string }>;
  },
): Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }> {
  const identity = participant.identityId
    ? useIdentityStore.getState().getIdentityById(participant.identityId)
    : null;

  const isGroup = conv.type === "group";
  const apiMessages: Array<{ role: string; content: unknown }> = [];

  // Build system prompt with optional workspace dir context
  const workspaceDir = conv.workspaceDir;
  let workspaceHint = "";
  if (workspaceDir) {
    workspaceHint = "\n\nThe user attached a local workspace to this conversation.";
    workspaceHint +=
      '\nWhen you want to create or write files, wrap each file in <file path="relative/path.ext">content</file> tags. The path must be relative to the workspace root.';
    if (options?.workspaceTree) {
      workspaceHint += `\n\nCurrent workspace tree:\n${options.workspaceTree}`;
    }
    if (options?.workspaceFiles?.length) {
      workspaceHint += "\n\nLoaded workspace files:";
      for (const file of options.workspaceFiles) {
        workspaceHint += `\n\n--- FILE: ${file.path} ---\n${file.content}`;
      }
    }
    workspaceHint +=
      "\nYou have workspace tools available:"
      + "\n- `read_workspace_file`: Read a text file by relative path."
      + "\n- `list_workspace_dir`: List files in a directory (omit path for root)."
      + "\n- `search_workspace`: Search for a text pattern across all files."
      + "\n- `edit_workspace_file`: Edit a file using search/replace (provide path, old_content, new_content). Always read the file first before editing."
      + "\nUse these tools to explore, read, and edit files. Do NOT ask the user to paste file content."
      + "\nUse relative paths when you discuss files.";
  }

  if (isGroup) {
    const roster = buildGroupRoster(conv, participant.id);
    const parts: string[] = [];
    if (conv.groupSystemPrompt) parts.push(conv.groupSystemPrompt);
    if (identity?.systemPrompt) parts.push(identity.systemPrompt);
    parts.push(roster);
    const groupPrompt = parts.join("\n\n") + workspaceHint;
    apiMessages.push({ role: "system", content: groupPrompt });
  } else if (identity?.systemPrompt || workspaceHint) {
    apiMessages.push({ role: "system", content: (identity?.systemPrompt || "") + workspaceHint });
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
          // Strip <think>/<thinking> blocks so other models don't see reasoning
          if (typeof content === "string") {
            content = content
              .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>\s*/g, "")
              .trim();
          }
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
