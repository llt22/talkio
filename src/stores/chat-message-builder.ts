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
 * Structured parts of a participant label for rich UI rendering.
 */
export interface ParticipantLabelParts {
  modelName: string;
  identityName: string | null;
  providerName: string | null;
  suffix: string | null; // "#1", "#2" etc.
}

/**
 * Get structured label parts for a participant, for flexible UI rendering.
 */
export function getParticipantLabelParts(
  participant: ConversationParticipant,
  allParticipants: ConversationParticipant[],
): ParticipantLabelParts {
  const providerStore = useProviderStore.getState();
  const identityStore = useIdentityStore.getState();
  const model = providerStore.getModelById(participant.modelId);
  const modelName = model?.displayName ?? participant.modelId;
  const identity = participant.identityId
    ? identityStore.getIdentityById(participant.identityId)
    : null;
  const identityName = identity?.name ?? null;
  const providerName = model
    ? (providerStore.getProviderById(model.providerId)?.name ?? null)
    : null;

  let suffix: string | null = null;
  const sameModelParticipants = allParticipants.filter((p) => p.modelId === participant.modelId);
  if (sameModelParticipants.length > 1) {
    const index = sameModelParticipants.findIndex((p) => p.id === participant.id);
    suffix = `#${index + 1}`;
  }

  return { modelName, identityName, providerName, suffix };
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

  // Same modelId added multiple times → append #N
  const sameModelParticipants = allParticipants.filter((p) => p.modelId === participant.modelId);
  if (sameModelParticipants.length > 1) {
    const index = sameModelParticipants.findIndex((p) => p.id === participant.id);
    return `${modelName} #${index + 1}`;
  }

  // Different modelIds but same displayName (e.g. same model from different providers)
  const sameNameParticipants = allParticipants.filter((p) => {
    if (p.modelId === participant.modelId) return false;
    const m = providerStore.getModelById(p.modelId);
    return (m?.displayName ?? p.modelId) === modelName;
  });
  if (sameNameParticipants.length > 0 && model) {
    const provider = providerStore.getProviderById(model.providerId);
    if (provider?.name) {
      return `${modelName} [${provider.name}]`;
    }
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
  const model = useProviderStore.getState().getModelById(participant.modelId);
  const supportsVision = !!model?.capabilities?.vision;

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
      "\nYou have workspace tools available:" +
      "\n- `read_workspace_file`: Read a text file by relative path." +
      "\n- `list_workspace_dir`: List files in a directory (omit path for root)." +
      "\n- `search_workspace`: Search for a text pattern across all files." +
      "\n- `edit_workspace_file`: Edit a file using search/replace (provide path, old_content, new_content). Always read the file first before editing." +
      "\n- `git_status`: Check git status (modified/staged/untracked files)." +
      "\n- `git_diff`: Show file changes (set staged=true for staged changes)." +
      "\n- `git_log`: Show recent commit history." +
      "\n- `git_command`: Run any allowed git subcommand. Write operations (add, commit, push, etc.) require user confirmation. Dangerous operations (force push, hard reset, rebase) are blocked." +
      "\nUse these tools to explore, read, edit files and manage git. Do NOT ask the user to paste file content." +
      "\nUse relative paths when you discuss files.";
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
        if (supportsVision) {
          const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
          if (m.content) parts.push({ type: "text", text: m.content });
          for (const uri of m.images) {
            parts.push({ type: "image_url", image_url: { url: uri } });
          }
          content = parts;
        } else {
          const imageOmittedNotice =
            "[User attached image(s), but they were omitted because this model does not support image input.]";
          content = m.content?.trim()
            ? `${m.content}\n\n${imageOmittedNotice}`
            : imageOmittedNotice;
        }
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
            content = content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>\s*/g, "").trim();
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
