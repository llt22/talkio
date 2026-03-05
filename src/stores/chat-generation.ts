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
import { getBuiltInToolDefs } from "../services/built-in-tools";
import { getMcpToolDefsForIdentity, refreshMcpConnections } from "../services/mcp";
import { generateId } from "../lib/id";
import { buildProviderHeaders } from "../services/provider-headers";
import { getAdapter } from "../services/provider-adapters";
import {
  createStreamFlusher,
  processSseDelta,
  applyCompression,
  type ContentAccumulator,
} from "./generation-helpers";
import { runToolCallLoop } from "./tool-call-loop";

const MAX_HISTORY = 200;

// ── Types ──

export interface StreamingState {
  cid: string;
  messageId: string;
  content: string;
  reasoning: string;
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
  if (!model || !provider) return "";

  // Unsupported provider type — create error message
  if (provider.type !== "openai") {
    const assistantMsgId = generateId();
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversationId: ctx.cid,
      role: "assistant",
      senderModelId: model.id,
      senderName: getParticipantLabel(participant, ctx.conversation.participants),
      identityId: participant.identityId,
      participantId: participant.id,
      content: "",
      images: [],
      generatedImages: [],
      reasoningContent: null,
      reasoningDuration: null,
      toolCalls: [],
      toolResults: [],
      branchId: ctx.activeBranchId,
      parentMessageId: null,
      isStreaming: false,
      status: MessageStatus.ERROR,
      errorMessage: [
        `This provider type is not supported yet: ${provider.type}.`,
        "",
        "Talkio currently supports OpenAI-compatible APIs only:",
        "- GET /models",
        "- POST /chat/completions (SSE streaming)",
        "",
        "How to fix:",
        "- Use an OpenAI-compatible gateway such as OpenRouter or LiteLLM.",
        "  Example baseUrl:",
        "  - https://openrouter.ai/api/v1",
        "  - http://<your-litellm-host>:4000/v1",
        "",
        "See: docs/provider-unified-protocol.md",
      ].join("\n"),
      tokenUsage: null,
      createdAt: new Date(Date.parse(ctx.userMsg.createdAt) + 1 + index).toISOString(),
    };
    await insertMessage(assistantMsg);
    notifyDbChange("messages", ctx.cid);
    return "";
  }

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
    new Date(Date.parse(ctx.userMsg.createdAt) + 1 + index).toISOString(),
  );
  await insertMessage(assistantMsg);
  notifyDbChange("messages", ctx.cid);

  // Init streaming state
  ctx.streamingMessages.set(assistantMsgId, { cid: ctx.cid, messageId: assistantMsgId, content: "", reasoning: "" });
  if (ctx.cid === ctx.getCurrentConversationId()) {
    const all = Array.from(ctx.streamingMessages.values()).filter((s) => s.cid === ctx.cid);
    ctx.setStoreState({ streamingMessages: all });
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
  await refreshMcpConnections().catch((err) =>
    console.warn("[chat-generation] MCP refresh failed:", err),
  );

  // Resolve tool definitions
  const builtInToolDefs = (() => {
    const defs = getBuiltInToolDefs();
    const selected = allowedBuiltInToolNames ?? new Set<string>();
    return defs.filter((d) => {
      const name = d.function.name;
      return builtInEnabledByName[name] !== false || (!!identity && selected.has(name));
    });
  })();
  const toolDefs = [...builtInToolDefs, ...getMcpToolDefsForIdentity(identity)];

  try {
    // Build API messages with compression
    const allMessages = await getRecentMessages(ctx.cid, ctx.activeBranchId, MAX_HISTORY);
    const filtered = allMessages.filter(
      (m) =>
        m.status === MessageStatus.SUCCESS ||
        m.status === MessageStatus.PAUSED ||
        m.id === ctx.userMsg.id,
    );

    // Read workspace tree if workspace dir is set
    let workspaceTree: string | undefined;
    if (ctx.conversation.workspaceDir) {
      try {
        const { readWorkspaceTree } = await import("../services/file-writer");
        workspaceTree = (await readWorkspaceTree(ctx.conversation.workspaceDir)) || undefined;
      } catch {
        /* ignore */
      }
    }

    const adapter = getAdapter(provider.apiFormat);

    let apiMessages = buildApiMessagesForParticipant(filtered, participant, ctx.conversation, {
      workspaceTree,
    });
    apiMessages = await applyCompression(apiMessages, ctx, baseUrl, headers, model.modelId, provider.apiFormat);

    const reasoningEffort =
      identity?.params?.reasoningEffort || (model.capabilities?.reasoning ? "medium" : undefined);

    // Initial SSE stream

    const acc: ContentAccumulator = {
      fullContent: "",
      fullReasoning: "",
      inThinkTag: false,
      pendingToolCalls: [],
    };
    const startTime = Date.now();
    const flusher = createStreamFlusher(
      ctx,
      assistantMsgId,
      () => acc.fullContent,
      () => acc.fullReasoning,
    );

    const { usage: sseUsage } = await adapter.streamChat({
      baseUrl,
      headers,
      modelId: model.modelId,
      messages: apiMessages,
      identity,
      reasoningEffort,
      toolDefs,
      signal: ctx.abortController.signal,
      onDelta: (delta) => {
        processSseDelta(acc, delta);
        flusher.schedule();
      },
    });
    flusher.flush();

    const duration = (Date.now() - startTime) / 1000;
    let tokenUsage = sseUsage
      ? { inputTokens: sseUsage.prompt_tokens, outputTokens: sseUsage.completion_tokens }
      : null;
    let lastContent = acc.fullContent;

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
      );
      lastContent = result.content;
    } else {
      await updateMessage(assistantMsgId, {
        content: acc.fullContent,
        reasoningContent: acc.fullReasoning || null,
        reasoningDuration: acc.fullReasoning ? duration : null,
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
    return lastContent;
  } catch (err: any) {
    if (err.name === "AbortError") {
      const sm = ctx.streamingMessages.get(assistantMsgId);
      if (sm) {
        await updateMessage(assistantMsgId, {
          content: sm.content,
          reasoningContent: sm.reasoning || null,
          isStreaming: false,
          status: MessageStatus.PAUSED,
        });
        notifyDbChange("messages", ctx.cid);
      }
    } else {
      console.error("[chat-generation] error:", err);
      const errMsg =
        err?.message || (typeof err === "string" ? err : JSON.stringify(err)) || "Unknown error";
      await updateMessage(assistantMsgId, {
        isStreaming: false,
        status: MessageStatus.ERROR,
        errorMessage: errMsg,
      });
      notifyDbChange("messages", ctx.cid);
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
