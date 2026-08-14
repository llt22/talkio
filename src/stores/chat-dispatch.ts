import type { Conversation, Message } from "../types";
import { MessageStatus } from "../types";
import {
  buildApiMessagesForParticipant,
  createUserMessage,
  extractMentionedParticipants,
  getParticipantLabel,
  resolveTargetParticipants,
} from "./chat-message-builder";
import {
  getConversation,
  getRecentMessages,
  getTaskById,
  insertMessage,
  updateConversation,
  updateTask,
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
  if (!firstModel || !firstProvider) return null;

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
    /** Moderator summary flow: targetParticipantIds selects the host. */
    moderatorSummary?: boolean;
    /** Task execution flow: the task whose request message drives generation. */
    taskId?: string;
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

  // Validate task execution before creating a visible request message or
  // transitioning its lifecycle. This avoids orphan requests and tasks stuck
  // in "running" when persisted task/model configuration is unavailable.
  const task = options?.taskId ? await getTaskById(options.taskId) : null;
  if (options?.taskId && !task) return;

  const targetIds = options?.targetParticipantIds;
  const targets = resolveTargetParticipants(
    conversation,
    targetIds && targetIds.length > 0 ? targetIds : options?.mentionedParticipantIds,
  );
  if (task) {
    const providerStore = useProviderStore.getState();
    const hasUnavailableTarget =
      targets.length === 0 ||
      targets.some((target) => {
        const model = providerStore.getModelById(target.modelId);
        return !model || !providerStore.getProviderById(model.providerId);
      });
    if (hasUnavailableTarget) {
      await updateTask(task.id, { status: "failed" });
      notifyDbChange("tasks", cid);
      return;
    }
  }

  let userMsg: Message;
  if (options?.reuseUserMessageId) {
    const allMessages = await getRecentMessages(conversationId, null, MAX_HISTORY);
    const existing = allMessages.find((message) => message.id === options.reuseUserMessageId);
    if (!existing || existing.role !== "user") return;
    userMsg = existing;
  } else {
    userMsg = createUserMessage(
      generateId(),
      cid,
      text,
      images ?? [],
      activeBranchId,
      options?.moderatorSummary
        ? "summary-request"
        : options?.taskId
          ? "task-request"
          : undefined,
    );
    await insertMessage(userMsg);
    updateConversation(cid, { lastMessage: text, lastMessageAt: userMsg.createdAt }).catch(
      () => {},
    );
    notifyDbChange("messages", cid);
    notifyDbChange("conversations");
  }

  // Task execution: transition the task to running and link its request message.
  if (options?.taskId) {
    await updateTask(
      options.taskId,
      options?.reuseUserMessageId
        ? { status: "running" }
        : { status: "running", requestMessageId: userMsg.id },
    );
    notifyDbChange("tasks", cid);
  }

  const abortController = new AbortController();
  abortControllers.set(cid, abortController);
  if (cid === getCurrentConversationId()) setStoreState({ isGenerating: true });

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

  const isRetry = !!(options?.reuseUserMessageId && options?.targetParticipantIds?.length);

  const systemPromptAppend = userMsg.kind === "summary-request"
    ? i18n.t("chat.summaryInstruction")
    : task
      ? i18n.t("chat.taskInstruction", {
          title: task.title,
          description: task.description,
          assignee: targets[0] ? getParticipantLabel(targets[0], conversation.participants) : "",
        })
      : undefined;

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
    isRetry,
    // Derived from the persisted message kind so retries (regenerate/edit)
    // keep their moderator semantics without the caller re-specifying it.
    moderatorSummary: userMsg.kind === "summary-request",
    taskId: task?.id,
    systemPromptAppend,
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

      // Moderator summaries are a one-shot host reply — no @ propagation.
      if (ctx.moderatorSummary || conversation.type !== "group" || round >= MAX_MENTION_ROUNDS)
        break;
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
      // AI @ propagation respects muting — muted members stay out of the loop
      // (only the user can wake them with an explicit mention).
      currentTargets = conversation.participants.filter(
        (participant) => mentionedIds.has(participant.id) && !participant.muted,
      );
      if (currentTargets.length === 0) break;
    }
  } finally {
    if (abortControllers.get(cid) === abortController) {
      abortControllers.delete(cid);
      if (cid === getCurrentConversationId()) {
        const activeStreams = Array.from(streamingMessages.values()).filter(
          (state) => state.cid === cid,
        );
        setStoreState({ isGenerating: false, streamingMessages: activeStreams });
      }
    }
  }
}

export async function runAutoDiscuss(args: {
  rounds: number;
  topicText?: string;
  currentConversationId: string | null;
  activeBranchId: string | null;
  isGenerating: () => boolean;
  autoDiscussRemaining: () => number;
  isSessionActive: () => boolean;
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
      conversationId?: string;
      activeBranchId?: string | null;
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

  const isActive = () => args.isSessionActive() && args.autoDiscussRemaining() > 0;

  try {
    while (args.isGenerating()) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!isActive()) return;
    }

    if (!isActive()) return;

    const continuePrompt = i18n.t("chat.continue", { defaultValue: "Continue" });

    if (topicText?.trim()) {
      await args.sendMessage(topicText.trim(), undefined, {
        conversationId: convId,
        activeBranchId: args.activeBranchId,
      });
      if (!isActive()) return;
    }
    args.setStoreState({ autoDiscussRemaining: rounds - 1 });

    for (let round = 1; round < rounds; round++) {
      if (!isActive()) break;
      await args.sendMessage(continuePrompt, undefined, {
        conversationId: convId,
        activeBranchId: args.activeBranchId,
      });
      if (!isActive()) break;
      args.setStoreState({ autoDiscussRemaining: Math.max(0, rounds - round - 1) });
    }
  } finally {
    if (args.isSessionActive()) {
      args.setStoreState({ autoDiscussRemaining: 0, autoDiscussTotalRounds: 0 });
    }
  }
}
