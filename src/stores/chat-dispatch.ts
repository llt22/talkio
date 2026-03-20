import type { Conversation, Message } from "../types";
import { MessageStatus } from "../types";
import {
  buildApiMessagesForParticipant,
  createUserMessage,
  extractMentionedParticipants,
  resolveTargetParticipants,
} from "./chat-message-builder";
import {
  getConversation,
  getRecentMessages,
  insertMessage,
  updateConversation,
} from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { useProviderStore } from "./provider-store";
import { buildProviderHeaders } from "../services/provider-headers";
import { useSettingsStore } from "./settings-store";
import {
  generateForParticipant,
  type GenerationContext,
  type StreamingState,
} from "./chat-generation";
import { estimateMessagesTokens, compressIfNeeded } from "../lib/context-compression";
import { generateId } from "../lib/id";
import i18n from "../i18n";
import { buildWorkspaceContextBundle } from "../services/workspace";

const MAX_HISTORY = 200;
const MAX_MENTION_ROUNDS = 2;

export async function preComputeCompression(
  cid: string,
  conversation: Conversation,
  targets: Conversation["participants"],
  userMsg: Message,
  abortController: AbortController,
  activeBranchId: string | null,
  workspaceContext?: { tree?: string; files: Array<{ path: string; content: string }> },
): Promise<string | null> {
  const compressionSettings = useSettingsStore.getState().settings;
  if (!compressionSettings.contextCompressionEnabled || targets.length === 0) return null;

  const providerStore = useProviderStore.getState();
  const firstModel = providerStore.getModelById(targets[0].modelId);
  const firstProvider = firstModel ? providerStore.getProviderById(firstModel.providerId) : null;
  if (!firstModel || !firstProvider || firstProvider.type !== "openai") return null;

  const allMsgs = await getRecentMessages(cid, activeBranchId, MAX_HISTORY);
  const filtered = allMsgs.filter(
    (message) => message.status === MessageStatus.SUCCESS || message.id === userMsg.id,
  );
  const sampleApiMessages = buildApiMessagesForParticipant(filtered, targets[0], conversation, {
    workspaceTree: workspaceContext?.tree,
    workspaceFiles: workspaceContext?.files,
  });
  const tokenCount = estimateMessagesTokens(sampleApiMessages);
  if (tokenCount <= compressionSettings.contextCompressionThreshold) return null;

  const baseUrl = firstProvider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(firstProvider, { "Content-Type": "application/json" });
  const result = await compressIfNeeded(sampleApiMessages, {
    maxTokens: compressionSettings.contextCompressionThreshold,
    keepRecentCount: 6,
    baseUrl,
    headers,
    model: firstModel.modelId,
    apiFormat: firstProvider.apiFormat,
    signal: abortController.signal,
  });
  if (!result.compressed) return null;

  const summaryMsg = result.messages.find(
    (message) =>
      typeof message.content === "string" &&
      (message.content as string).startsWith("[Previous conversation summary]"),
  );
  return summaryMsg ? (summaryMsg.content as string) : null;
}

export async function dispatchMessageGeneration(args: {
  conversationId: string;
  text: string;
  images?: string[];
  options?: {
    reuseUserMessageId?: string;
    mentionedParticipantIds?: string[];
    targetParticipantIds?: string[];
  };
  activeBranchId: string | null;
  getCurrentConversationId: () => string | null;
  abortControllers: Map<string, AbortController>;
  streamingMessages: Map<string, StreamingState>;
  setStoreState: (partial: {
    isGenerating?: boolean;
    streamingMessages?: StreamingState[];
  }) => void;
}): Promise<void> {
  const {
    conversationId,
    text,
    images,
    options,
    activeBranchId,
    getCurrentConversationId,
    abortControllers,
    streamingMessages,
    setStoreState,
  } = args;

  const conversation = await getConversation(conversationId);
  if (!conversation) return;
  const cid = conversationId;

  let userMsg: Message;
  if (options?.reuseUserMessageId) {
    const allMessages = await getRecentMessages(conversationId, null, MAX_HISTORY);
    const existing = allMessages.find((message) => message.id === options.reuseUserMessageId);
    if (!existing || existing.role !== "user") return;
    userMsg = existing;
  } else {
    userMsg = createUserMessage(generateId(), cid, text, images ?? [], activeBranchId);
    await insertMessage(userMsg);
    updateConversation(cid, { lastMessage: text, lastMessageAt: userMsg.createdAt }).catch(
      () => {},
    );
    notifyDbChange("messages", cid);
    notifyDbChange("conversations");
  }

  const abortController = new AbortController();
  abortControllers.set(cid, abortController);
  if (cid === getCurrentConversationId()) setStoreState({ isGenerating: true });

  const targetIds = options?.targetParticipantIds;
  const targets = resolveTargetParticipants(
    conversation,
    targetIds && targetIds.length > 0 ? targetIds : options?.mentionedParticipantIds,
  );
  const workspaceContext = conversation.workspaceDir
    ? await buildWorkspaceContextBundle(conversation.workspaceDir, text, { includeTree: true })
    : { files: [] as Array<{ path: string; content: string }>, tree: undefined };
  const cachedCompressionSummary = await preComputeCompression(
    cid,
    conversation,
    targets,
    userMsg,
    abortController,
    activeBranchId,
    workspaceContext,
  );
  const compressionSettings = useSettingsStore.getState().settings;

  const ctx: GenerationContext = {
    cid,
    conversation,
    userMsg,
    activeBranchId,
    abortController,
    cachedCompressionSummary,
    compressionEnabled: compressionSettings.contextCompressionEnabled,
    compressionThreshold: compressionSettings.contextCompressionThreshold,
    streamingMessages,
    getCurrentConversationId,
    setStoreState: (partial) => setStoreState(partial),
    workspaceTree: workspaceContext.tree,
    workspaceFiles: workspaceContext.files,
  };

  let globalMsgIndex = 0;
  try {
    let currentTargets = targets;
    for (let round = 0; round <= MAX_MENTION_ROUNDS; round++) {
      if (abortController.signal.aborted || currentTargets.length === 0) break;

      const responses: { participantId: string; content: string }[] = [];
      if (conversation.speakingOrder === "parallel" && currentTargets.length > 1) {
        const baseIndex = globalMsgIndex;
        const results = await Promise.all(
          currentTargets.map((target, index) =>
            generateForParticipant(ctx, target, baseIndex + index),
          ),
        );
        globalMsgIndex += currentTargets.length;
        currentTargets.forEach((target, index) =>
          responses.push({ participantId: target.id, content: results[index] }),
        );
      } else {
        for (let index = 0; index < currentTargets.length; index++) {
          if (abortController.signal.aborted) break;
          const content = await generateForParticipant(
            ctx,
            currentTargets[index],
            globalMsgIndex++,
          );
          responses.push({ participantId: currentTargets[index].id, content });
        }
      }

      if (conversation.type !== "group" || round >= MAX_MENTION_ROUNDS) break;
      const mentionedIds = new Set<string>();
      for (const response of responses) {
        if (!response.content) continue;
        const ids = extractMentionedParticipants(
          response.content,
          conversation,
          response.participantId,
        );
        for (const id of ids) mentionedIds.add(id);
      }
      for (const response of responses) mentionedIds.delete(response.participantId);
      if (mentionedIds.size === 0) break;
      currentTargets = conversation.participants.filter((participant) =>
        mentionedIds.has(participant.id),
      );
    }
  } finally {
    abortControllers.delete(cid);
    for (const [key, value] of streamingMessages) {
      if (value.cid === cid) streamingMessages.delete(key);
    }
    if (cid === getCurrentConversationId()) {
      setStoreState({ isGenerating: false, streamingMessages: [] });
    }
  }
}

export async function runAutoDiscuss(args: {
  rounds: number;
  topicText?: string;
  currentConversationId: string | null;
  isGenerating: () => boolean;
  autoDiscussRemaining: () => number;
  setStoreState: (partial: {
    autoDiscussRemaining?: number;
    autoDiscussTotalRounds?: number;
  }) => void;
  sendMessage: (
    text: string,
    images?: string[],
    options?: {
      reuseUserMessageId?: string;
      mentionedParticipantIds?: string[];
      targetParticipantIds?: string[];
    },
  ) => Promise<void>;
}): Promise<void> {
  const { rounds, topicText } = args;
  const convId = args.currentConversationId;
  if (!convId) return;

  const conversation = await getConversation(convId);
  if (!conversation || conversation.type !== "group" || conversation.participants.length < 2)
    return;

  args.setStoreState({ autoDiscussRemaining: rounds, autoDiscussTotalRounds: rounds });

  while (args.isGenerating()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (args.autoDiscussRemaining() <= 0) return;
  }

  const continuePrompt = i18n.t("chat.continue", { defaultValue: "Continue" });

  if (topicText?.trim()) {
    await args.sendMessage(topicText.trim());
  }
  args.setStoreState({ autoDiscussRemaining: rounds - 1 });

  for (let round = 1; round < rounds; round++) {
    if (args.autoDiscussRemaining() <= 0) break;
    await args.sendMessage(continuePrompt);
    args.setStoreState({ autoDiscussRemaining: Math.max(0, rounds - round - 1) });
  }

  args.setStoreState({ autoDiscussRemaining: 0, autoDiscussTotalRounds: 0 });
}
