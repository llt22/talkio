/**
 * Chat generation — extracted from chat-store.ts.
 * Handles streaming SSE generation for a single participant,
 * including tool calls, think-tag parsing, and context compression.
 */
import type { Message, Conversation, ConversationParticipant } from "../types";
import { MessageStatus } from "../types";
import { useIdentityStore } from "./identity-store";
import { useProviderStore } from "./provider-store";
import { useBuiltInToolsStore } from "./built-in-tools-store";
import {
  getParticipantLabel,
  buildApiMessagesForParticipant,
  createAssistantMessage,
} from "./chat-message-builder";
import {
  insertMessage,
  getRecentMessages,
  updateMessage,
  updateConversation,
} from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { updateTask } from "../storage/database";
import { getBuiltInToolDefs } from "../services/built-in-tools";
import { getMcpToolDefsForIdentity, refreshMcpConnections } from "../services/mcp";
import { generateId } from "../lib/id";
import i18n from "../i18n";
import { buildProviderHeaders } from "../services/provider-headers";
import { getAdapter } from "../services/provider-adapters";
import { resolveAdapterBaseUrl } from "../services/provider-request";
import { NormalModelRuntime } from "../services/runtime/model-runtime";
import type { GenerationEvent } from "../services/runtime/events";
import {
  GenerationRunError,
  generationErrorFromUnknown,
  logGenerationRun,
  userVisibleGenerationError,
} from "../services/runtime/generation-run";
import {
  createStreamFlusher,
  processSseDelta,
  applyCompression,
  type ContentAccumulator,
} from "./generation-helpers";
import { runToolCallLoop } from "./tool-call-loop";
import { persistGeneratedImages } from "../services/image-store";

const MAX_HISTORY = 200;

// ── Types ──

export interface StreamingState {
  cid: string;
  messageId: string;
  content: string;
  reasoning: string;
  /** Images generated so far in this run, as `data:` URLs */
  images: string[];
}

export interface GenerationContext {
  cid: string;
  conversation: Conversation;
  userMsg: Message;
  activeBranchId: string | null;
  abortController: AbortController;
  cachedCompressionSummary: string | null;
  compressionEnabled: boolean;
  compressionThreshold: number;
  streamingMessages: Map<string, StreamingState>;
  getCurrentConversationId: () => string | null;
  setStoreState: (partial: { streamingMessages: StreamingState[] }) => void;
  workspaceTree?: string;
  workspaceFiles?: Array<{ path: string; content: string }>;
  isRetry?: boolean;
  /** When true, the generated assistant message is a moderator summary. */
  moderatorSummary?: boolean;
  /** When set, the generated assistant message is a task result for this task. */
  taskId?: string;
  /** Extra instructions appended to the participant's system prompt. */
  systemPromptAppend?: string;
}

export function applyRuntimeEvent(
  event: GenerationEvent,
  acc: ContentAccumulator,
  toolCallIndexById: Map<string, number>,
): void {
  if (event.type === "text-delta") {
    processSseDelta(acc, { content: event.text });
    return;
  }
  if (event.type === "thinking-delta") {
    processSseDelta(acc, { reasoning_content: event.text });
    return;
  }
  if (event.type === "image-generated") {
    processSseDelta(acc, { images: [event.url] });
    return;
  }
  if (event.type === "tool-call-started") {
    const index = acc.pendingToolCalls.length;
    toolCallIndexById.set(event.callId, index);
    processSseDelta(acc, {
      tool_calls: [
        {
          index,
          id: event.callId,
          function: { name: event.name, arguments: "" },
        },
      ],
    });
    return;
  }
  if (event.type === "tool-call-arguments-delta") {
    const index = toolCallIndexById.get(event.callId);
    if (index === undefined) throw new Error(`Unknown tool call event: ${event.callId}`);
    processSseDelta(acc, {
      tool_calls: [{ index, function: { arguments: event.delta } }],
    });
  }
}

// ── Main generation function ──

/**
 * Generate a response for a single participant.
 * Returns the assistant's response content.
 */
export async function generateForParticipant(
  ctx: GenerationContext,
  participant: ConversationParticipant,
  index: number,
): Promise<string> {
  const providerStore = useProviderStore.getState();
  const model = providerStore.getModelById(participant.modelId);
  const provider = model ? providerStore.getProviderById(model.providerId) : null;
  if (!model || !provider) {
    if (ctx.taskId) {
      await updateTask(ctx.taskId, { status: "failed" });
      notifyDbChange("tasks", ctx.cid);
    }
    return "";
  }

  const msgCreatedAt = ctx.isRetry
    ? new Date(Date.now() + index).toISOString()
    : new Date(Date.parse(ctx.userMsg.createdAt) + 1 + index).toISOString();

  // Resolve identity and tools
  const identity = participant.identityId
    ? useIdentityStore.getState().getIdentityById(participant.identityId)
    : null;
  const allowedBuiltInToolNames = identity ? new Set(identity.mcpToolIds ?? []) : null;
  const allowedServerIds = identity?.mcpServerIds?.length ? identity.mcpServerIds : undefined;
  const builtInEnabledByName = useBuiltInToolsStore.getState().enabledByName;
  const senderName = getParticipantLabel(participant, ctx.conversation.participants);

  // Create assistant message skeleton
  const assistantMsgId = generateId();
  const assistantMsg = createAssistantMessage(
    assistantMsgId,
    ctx.cid,
    model.id,
    senderName,
    participant.id,
    participant.identityId,
    ctx.activeBranchId,
    msgCreatedAt,
    ctx.moderatorSummary ? "summary" : ctx.taskId ? "task-result" : undefined,
  );
  await insertMessage(assistantMsg);
  notifyDbChange("messages", ctx.cid);

  // Init streaming state
  ctx.streamingMessages.set(assistantMsgId, {
    cid: ctx.cid,
    messageId: assistantMsgId,
    content: "",
    reasoning: "",
    images: [],
  });
  if (ctx.cid === ctx.getCurrentConversationId()) {
    const all = Array.from(ctx.streamingMessages.values()).filter((s) => s.cid === ctx.cid);
    ctx.setStoreState({ streamingMessages: all });
  }

  const baseUrl = resolveAdapterBaseUrl(provider, model.modelId);
  const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
  await refreshMcpConnections().catch((err) =>
    console.warn("[chat-generation] MCP refresh failed:", err),
  );

  // Resolve tool definitions
  const toolContext = { workspaceDir: ctx.conversation.workspaceDir || undefined };
  const builtInToolDefs = (() => {
    const defs = getBuiltInToolDefs(toolContext);
    const selected = allowedBuiltInToolNames ?? new Set<string>();
    return defs.filter((d) => {
      const name = d.function.name;
      return builtInEnabledByName[name] !== false || (!!identity && selected.has(name));
    });
  })();
  const toolDefs = [...builtInToolDefs, ...getMcpToolDefsForIdentity(identity)];

  const generationStartedAt = Date.now();
  try {
    // Build API messages with compression
    const allMessages = await getRecentMessages(ctx.cid, ctx.activeBranchId, MAX_HISTORY);
    const filtered = allMessages.filter(
      (m) =>
        m.status === MessageStatus.SUCCESS ||
        m.status === MessageStatus.PAUSED ||
        m.id === ctx.userMsg.id,
    );
    const adapter = getAdapter(provider.apiFormat);
    const runtime = new NormalModelRuntime(() => adapter);

    let apiMessages = buildApiMessagesForParticipant(filtered, participant, ctx.conversation, {
      workspaceTree: ctx.workspaceTree,
      workspaceFiles: ctx.workspaceFiles,
      systemPromptAppend: ctx.systemPromptAppend,
    });
    apiMessages = await applyCompression(
      apiMessages,
      ctx,
      baseUrl,
      headers,
      model.modelId,
      provider.apiFormat,
    );

    const reasoningEffort =
      participant.reasoningEffort ||
      (provider.apiFormat === "anthropic-messages"
        ? undefined
        : model.capabilities?.reasoning
          ? "medium"
          : undefined);

    // Initial SSE stream

    const acc: ContentAccumulator = {
      fullContent: "",
      fullReasoning: "",
      inThinkTag: false,
      images: [],
      pendingToolCalls: [],
    };
    const startTime = generationStartedAt;
    const runContext = {
      runId: assistantMsgId,
      providerId: provider.id,
      modelId: model.modelId,
      round: 0,
    };
    logGenerationRun({ ...runContext, event: "started" });
    const flusher = createStreamFlusher(
      ctx,
      assistantMsgId,
      () => acc.fullContent,
      () => acc.fullReasoning,
      () => acc.images,
    );
    const streamOnce = async () => {
      let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null =
        null;
      const toolCallIndexById = new Map<string, number>();
      for await (const event of runtime.run({
        runId: assistantMsgId,
        apiFormat: provider.apiFormat,
        baseUrl,
        headers,
        modelId: model.modelId,
        messages: apiMessages,
        identity,
        reasoningEffort,
        toolDefs,
        signal: ctx.abortController.signal,
      })) {
        applyRuntimeEvent(event, acc, toolCallIndexById);
        if (
          event.type === "text-delta" ||
          event.type === "thinking-delta" ||
          event.type === "image-generated"
        ) {
          flusher.schedule();
        }
        if (event.type === "usage") {
          usage = {
            prompt_tokens: event.usage.inputTokens,
            completion_tokens: event.usage.outputTokens,
            total_tokens: event.usage.inputTokens + event.usage.outputTokens,
          };
        }
        if (event.type === "run-failed") {
          if (event.error.code === "aborted") {
            throw new DOMException(event.error.message, "AbortError");
          }
          throw new GenerationRunError(event.error);
        }
      }
      return { usage };
    };

    const resetAcc = () => {
      acc.fullContent = "";
      acc.fullReasoning = "";
      acc.inThinkTag = false;
      acc.images = [];
      acc.pendingToolCalls = [];
    };

    // Stream with auto-retry on transient errors
    let sseUsage;
    try {
      ({ usage: sseUsage } = await streamOnce());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        /empty response|overloaded|timeout|temporarily|503|502|network|interrupted/i.test(message);
      if (!retryable || ctx.abortController.signal.aborted) throw error;
      resetAcc();
      ({ usage: sseUsage } = await streamOnce());
    }
    flusher.flush();

    const duration = (Date.now() - startTime) / 1000;
    let tokenUsage = sseUsage
      ? { inputTokens: sseUsage.prompt_tokens, outputTokens: sseUsage.completion_tokens }
      : null;
    let lastContent = acc.fullContent;
    let generationSucceeded = true;

    // Tool calls → multi-round loop
    if (acc.pendingToolCalls.length > 0) {
      const result = await runToolCallLoop(
        ctx,
        assistantMsgId,
        acc,
        acc.fullReasoning,
        apiMessages,
        adapter,
        baseUrl,
        headers,
        model.modelId,
        identity,
        reasoningEffort,
        toolDefs,
        builtInEnabledByName,
        allowedBuiltInToolNames,
        allowedServerIds,
        tokenUsage,
        toolContext,
        provider.id,
      );
      lastContent = result.content;
    } else if (!acc.fullContent && !acc.fullReasoning && acc.images.length === 0) {
      // Empty response — retry once
      resetAcc();
      const retry = await streamOnce();
      flusher.flush();

      if (retry.usage) {
        tokenUsage = {
          inputTokens: retry.usage.prompt_tokens,
          outputTokens: retry.usage.completion_tokens,
        };
      }

      if (!acc.fullContent && !acc.fullReasoning && acc.images.length === 0) {
        generationSucceeded = false;
        await updateMessage(assistantMsgId, {
          isStreaming: false,
          status: MessageStatus.ERROR,
          errorMessage:
            "Model returned an empty response twice. It may be unavailable, overloaded, or the model ID may be incorrect.",
        });
      } else {
        await updateMessage(assistantMsgId, {
          content: acc.fullContent,
          reasoningContent: acc.fullReasoning || null,
          reasoningDuration: acc.fullReasoning ? duration : null,
          generatedImages: await persistGeneratedImages(acc.images),
          isStreaming: false,
          status: MessageStatus.SUCCESS,
          tokenUsage,
        });
        lastContent = acc.fullContent;
      }
    } else {
      await updateMessage(assistantMsgId, {
        content: acc.fullContent,
        reasoningContent: acc.fullReasoning || null,
        reasoningDuration: acc.fullReasoning ? duration : null,
        generatedImages: await persistGeneratedImages(acc.images),
        isStreaming: false,
        status: MessageStatus.SUCCESS,
        tokenUsage,
      });
    }

    await updateConversation(ctx.cid, {
      lastMessage: (lastContent || ctx.userMsg.content).slice(0, 100),
      lastMessageAt: new Date().toISOString(),
    });
    notifyDbChange("messages", ctx.cid);
    notifyDbChange("conversations");
    if (ctx.taskId) {
      await updateTask(
        ctx.taskId,
        generationSucceeded
          ? { status: "done", resultMessageId: assistantMsgId }
          : { status: "failed" },
      );
      notifyDbChange("tasks", ctx.cid);
    }
    logGenerationRun({ ...runContext, event: "completed", durationMs: Date.now() - startTime });
    return lastContent;
  } catch (error: unknown) {
    // Save streaming content before cleanup (needed for AbortError/PAUSED)
    const sm = ctx.streamingMessages.get(assistantMsgId);
    const generationError = generationErrorFromUnknown(error);

    if (generationError.code === "aborted") {
      if (ctx.taskId) {
        await updateTask(ctx.taskId, { status: "paused" });
        notifyDbChange("tasks", ctx.cid);
      }
      if (sm) {
        await updateMessage(assistantMsgId, {
          content: sm.content,
          reasoningContent: sm.reasoning || null,
          generatedImages: await persistGeneratedImages(sm.images),
          isStreaming: false,
          status: MessageStatus.PAUSED,
        });
        notifyDbChange("messages", ctx.cid);
      }
    } else {
      logGenerationRun({
        runId: assistantMsgId,
        providerId: provider.id,
        modelId: model.modelId,
        round: 0,
        event: "failed",
        durationMs: Date.now() - generationStartedAt,
        errorCode: generationError.code,
        retryable: generationError.retryable,
      });
      await updateMessage(assistantMsgId, {
        isStreaming: false,
        status: MessageStatus.ERROR,
        errorMessage: userVisibleGenerationError(generationError),
      });
      notifyDbChange("messages", ctx.cid);
      if (ctx.taskId) {
        await updateTask(ctx.taskId, { status: "failed" });
        notifyDbChange("tasks", ctx.cid);
      }
    }
    return "";
  } finally {
    ctx.streamingMessages.delete(assistantMsgId);
    if (ctx.cid === ctx.getCurrentConversationId()) {
      const all = Array.from(ctx.streamingMessages.values()).filter((s) => s.cid === ctx.cid);
      ctx.setStoreState({ streamingMessages: all });
    }
  }
}
