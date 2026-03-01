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
import { getBuiltInToolDefs, executeBuiltInTool } from "../services/built-in-tools";
import {
  executeMcpToolByName,
  getMcpToolDefsForIdentity,
  refreshMcpConnections,
} from "../services/mcp";
import { generateId } from "../lib/id";
import { consumeOpenAIChatCompletionsSse } from "../services/openai-chat-sse";
import { buildProviderHeaders } from "../services/provider-headers";
import { appFetch } from "../lib/http";
import { compressIfNeeded, getManualSummary } from "../lib/context-compression";

const MAX_HISTORY = 200;

// ── Types ──

export interface StreamingState {
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
  setStoreState: (partial: { streamingMessage: StreamingState | null }) => void;
}

// ── Helpers ──

/** Find the earliest occurrence of any of the given tags in a string */
function findFirst(str: string, ...tags: string[]): { idx: number; len: number } | null {
  let best: { idx: number; len: number } | null = null;
  for (const tag of tags) {
    const i = str.indexOf(tag);
    if (i !== -1 && (best === null || i < best.idx)) best = { idx: i, len: tag.length };
  }
  return best;
}

/** Create rAF-throttled streaming state updater (DRYs the duplicated pattern) */
function createStreamFlusher(
  ctx: GenerationContext,
  messageId: string,
  getContent: () => string,
  getReasoning: () => string,
) {
  let rafPending = false;
  let dirty = false;

  function flush() {
    rafPending = false;
    if (!dirty) return;
    dirty = false;
    const sm: StreamingState = { messageId, content: getContent(), reasoning: getReasoning() };
    ctx.streamingMessages.set(ctx.cid, sm);
    if (ctx.cid === ctx.getCurrentConversationId()) {
      ctx.setStoreState({ streamingMessage: sm });
    }
  }

  function schedule() {
    dirty = true;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(flush);
    }
  }

  return { flush, schedule };
}

/** Apply context compression (manual summary > cached group > auto-compress) */
async function applyCompression(
  apiMessages: Array<{ role: string; content: unknown }>,
  ctx: GenerationContext,
  baseUrl: string,
  headers: Record<string, string>,
  modelId: string,
): Promise<Array<{ role: string; content: unknown }>> {
  const manualSummary = getManualSummary(ctx.cid);

  if (manualSummary) {
    return injectSummary(apiMessages, manualSummary);
  }
  if (ctx.compressionEnabled && ctx.cachedCompressionSummary) {
    return injectSummary(apiMessages, ctx.cachedCompressionSummary);
  }
  if (ctx.compressionEnabled) {
    const result = await compressIfNeeded(apiMessages, {
      maxTokens: ctx.compressionThreshold,
      keepRecentCount: 6,
      baseUrl,
      headers,
      model: modelId,
      signal: ctx.abortController.signal,
    });
    return result.messages;
  }
  return apiMessages;
}

function injectSummary(
  apiMessages: Array<{ role: string; content: unknown }>,
  summary: string,
): Array<{ role: string; content: unknown }> {
  const systemMsgs = apiMessages.filter((m) => m.role === "system");
  const convMsgs = apiMessages.filter((m) => m.role !== "system");
  const keepCount = Math.min(6, convMsgs.length);
  const recent = convMsgs.slice(convMsgs.length - keepCount);
  return [...systemMsgs, { role: "user", content: summary }, ...recent];
}

/** Execute a single tool call against built-in tools or MCP */
async function executeOneTool(
  name: string,
  args: Record<string, unknown>,
  builtInEnabledByName: Record<string, boolean>,
  identity: any,
  allowedBuiltInToolNames: Set<string> | null,
  allowedServerIds: string[] | undefined,
): Promise<{ toolCallId?: string; content: string }> {
  const builtInGloballyEnabled = builtInEnabledByName[name] !== false;
  const builtInEnabledForIdentity =
    !!identity && allowedBuiltInToolNames != null && allowedBuiltInToolNames.has(name);
  const builtIn =
    builtInGloballyEnabled || builtInEnabledForIdentity
      ? await executeBuiltInTool(name, args)
      : null;
  if (builtIn) return { content: builtIn.success ? builtIn.content : `Error: ${builtIn.error}` };

  const remote = await executeMcpToolByName(name, args, allowedServerIds);
  if (remote) return { content: remote.success ? remote.content : `Error: ${remote.error}` };

  return { content: `Tool not found: ${name}` };
}

/** Parse tool call arguments safely */
function parseToolArgs(argsStr: string): Record<string, unknown> {
  try {
    return JSON.parse(argsStr);
  } catch {
    return {};
  }
}

/** Build the request body for chat completions */
function buildRequestBody(
  modelId: string,
  apiMessages: Array<{ role: string; content: unknown }>,
  identity: any,
  reasoningEffort: string | undefined,
  toolDefs: any[],
): Record<string, unknown> {
  return {
    model: modelId,
    messages: apiMessages,
    stream: true,
    stream_options: { include_usage: true },
    ...(identity?.params?.temperature !== undefined
      ? { temperature: identity.params.temperature }
      : {}),
    ...(identity?.params?.topP !== undefined ? { top_p: identity.params.topP } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
  };
}

// ── SSE content parsing with think-tag support ──

interface ContentAccumulator {
  fullContent: string;
  fullReasoning: string;
  inThinkTag: boolean;
  pendingToolCalls: { id: string; name: string; arguments: string }[];
}

function processSseDelta(acc: ContentAccumulator, delta: any): void {
  const rc = delta.reasoning_content ?? delta.reasoning;
  if (rc) acc.fullReasoning += rc;

  if (delta.content) {
    let chunk = delta.content as string;
    while (chunk.length > 0) {
      if (acc.inThinkTag) {
        const m = findFirst(chunk, "</think>", "</thinking>");
        if (m) {
          acc.fullReasoning += chunk.slice(0, m.idx);
          chunk = chunk.slice(m.idx + m.len);
          acc.inThinkTag = false;
        } else {
          acc.fullReasoning += chunk;
          chunk = "";
        }
      } else {
        const m = findFirst(chunk, "<think>", "<thinking>");
        if (m) {
          acc.fullContent += chunk.slice(0, m.idx);
          chunk = chunk.slice(m.idx + m.len);
          acc.inThinkTag = true;
        } else {
          acc.fullContent += chunk;
          chunk = "";
        }
      }
    }
  }

  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      while (acc.pendingToolCalls.length <= idx) {
        acc.pendingToolCalls.push({ id: "", name: "", arguments: "" });
      }
      if (tc.id) acc.pendingToolCalls[idx].id = tc.id;
      if (tc.function?.name) acc.pendingToolCalls[idx].name += tc.function.name;
      if (tc.function?.arguments) acc.pendingToolCalls[idx].arguments += tc.function.arguments;
    }
  }
}

// ── Multi-round tool call loop ──

const MAX_TOOL_ROUNDS = 5;

async function runToolCallLoop(
  ctx: GenerationContext,
  assistantMsgId: string,
  acc: ContentAccumulator,
  fullReasoning: string,
  apiMessages: any[],
  baseUrl: string,
  headers: Record<string, string>,
  modelId: string,
  identity: any,
  reasoningEffort: string | undefined,
  toolDefs: any[],
  builtInEnabledByName: Record<string, boolean>,
  allowedBuiltInToolNames: Set<string> | null,
  allowedServerIds: string[] | undefined,
  tokenUsage: { inputTokens: number; outputTokens: number } | null,
): Promise<{ content: string; tokenUsage: { inputTokens: number; outputTokens: number } | null }> {
  // Save initial tool calls
  await updateMessage(assistantMsgId, {
    content: acc.fullContent,
    reasoningContent: fullReasoning || null,
    reasoningDuration: null,
    toolCalls: acc.pendingToolCalls,
  });
  notifyDbChange("messages", ctx.cid);

  // Execute initial tool calls
  const toolResults: { toolCallId: string; content: string }[] = [];
  for (const tc of acc.pendingToolCalls) {
    const result = await executeOneTool(
      tc.name,
      parseToolArgs(tc.arguments),
      builtInEnabledByName,
      identity,
      allowedBuiltInToolNames,
      allowedServerIds,
    );
    toolResults.push({ toolCallId: tc.id, content: result.content });
  }
  await updateMessage(assistantMsgId, { toolResults });
  notifyDbChange("messages", ctx.cid);

  let currentToolCalls = acc.pendingToolCalls;
  let currentToolResults = toolResults;
  let accumulatedContent = acc.fullContent;
  let currentTokenUsage = tokenUsage;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const toolMessages = [
      ...apiMessages,
      {
        role: "assistant" as const,
        content: accumulatedContent || null,
        tool_calls: currentToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      },
      ...currentToolResults.map((tr) => ({
        role: "tool" as const,
        tool_call_id: tr.toolCallId,
        content: tr.content,
      })),
    ];

    // Stream follow-up
    ctx.streamingMessages.set(ctx.cid, {
      messageId: assistantMsgId,
      content: accumulatedContent,
      reasoning: fullReasoning,
    });
    if (ctx.cid === ctx.getCurrentConversationId()) {
      ctx.setStoreState({
        streamingMessage: {
          messageId: assistantMsgId,
          content: accumulatedContent,
          reasoning: fullReasoning,
        },
      });
    }

    const response = await appFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildRequestBody(modelId, toolMessages, identity, reasoningEffort, toolDefs),
      ),
      signal: ctx.abortController.signal,
    });
    if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    let toolContent = accumulatedContent;
    const newToolCalls: { id: string; name: string; arguments: string }[] = [];
    const flusher = createStreamFlusher(
      ctx,
      assistantMsgId,
      () => toolContent,
      () => fullReasoning,
    );

    const sseUsage = await consumeOpenAIChatCompletionsSse(reader, (delta) => {
      if (delta?.content) {
        toolContent += delta.content;
        flusher.schedule();
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          while (newToolCalls.length <= idx) newToolCalls.push({ id: "", name: "", arguments: "" });
          if (tc.id) newToolCalls[idx].id = tc.id;
          if (tc.function?.name) newToolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) newToolCalls[idx].arguments += tc.function.arguments;
        }
      }
    });
    if (sseUsage)
      currentTokenUsage = {
        inputTokens: sseUsage.prompt_tokens,
        outputTokens: sseUsage.completion_tokens,
      };
    flusher.flush();
    accumulatedContent = toolContent;

    if (newToolCalls.length === 0) break;

    // Execute new tool calls
    await updateMessage(assistantMsgId, {
      content: accumulatedContent,
      toolCalls: [...currentToolCalls, ...newToolCalls],
    });
    notifyDbChange("messages", ctx.cid);

    const newResults: { toolCallId: string; content: string }[] = [];
    for (const tc of newToolCalls) {
      const result = await executeOneTool(
        tc.name,
        parseToolArgs(tc.arguments),
        builtInEnabledByName,
        identity,
        allowedBuiltInToolNames,
        allowedServerIds,
      );
      newResults.push({ toolCallId: tc.id, content: result.content });
    }
    await updateMessage(assistantMsgId, { toolResults: [...currentToolResults, ...newResults] });
    notifyDbChange("messages", ctx.cid);

    apiMessages.push(
      {
        role: "assistant" as const,
        content: accumulatedContent || null,
        tool_calls: newToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      },
      ...newResults.map((tr) => ({
        role: "tool" as const,
        tool_call_id: tr.toolCallId,
        content: tr.content,
      })),
    );
    currentToolCalls = newToolCalls;
    currentToolResults = newResults;
  }

  await updateMessage(assistantMsgId, {
    content: accumulatedContent,
    isStreaming: false,
    status: MessageStatus.SUCCESS,
    tokenUsage: currentTokenUsage,
  });

  return { content: accumulatedContent, tokenUsage: currentTokenUsage };
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
  ctx.streamingMessages.set(ctx.cid, { messageId: assistantMsgId, content: "", reasoning: "" });
  if (ctx.cid === ctx.getCurrentConversationId()) {
    ctx.setStoreState({
      streamingMessage: { messageId: assistantMsgId, content: "", reasoning: "" },
    });
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
  await refreshMcpConnections().catch((err) => console.warn("[chat-generation] MCP refresh failed:", err));

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

    let apiMessages = buildApiMessagesForParticipant(filtered, participant, ctx.conversation, {
      workspaceTree,
    });
    apiMessages = await applyCompression(apiMessages, ctx, baseUrl, headers, model.modelId);

    const reasoningEffort =
      identity?.params?.reasoningEffort || (model.capabilities?.reasoning ? "medium" : undefined);

    // Initial SSE stream
    const response = await appFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildRequestBody(model.modelId, apiMessages, identity, reasoningEffort, toolDefs),
      ),
      signal: ctx.abortController.signal,
    });
    if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

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

    const sseUsage = await consumeOpenAIChatCompletionsSse(reader, (delta) => {
      processSseDelta(acc, delta);
      flusher.schedule();
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
      const sm = ctx.streamingMessages.get(ctx.cid);
      if (sm && sm.messageId === assistantMsgId) {
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
    ctx.streamingMessages.delete(ctx.cid);
    if (ctx.cid === ctx.getCurrentConversationId()) {
      ctx.setStoreState({ streamingMessage: null });
    }
  }
}
