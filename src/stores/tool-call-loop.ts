/**
 * Multi-round tool call loop — extracted from chat-generation.ts.
 * Handles iterative tool execution and follow-up streaming.
 */
import { MessageStatus } from "../types";
import { updateMessage } from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import {
  executeBuiltInTool,
  getBuiltInToolDefs,
  type ToolContext,
} from "../services/built-in-tools";
import { executeMcpToolByName } from "../services/mcp";
import { toolApproval } from "../services/tool-approval";
import type { ProviderAdapter } from "../services/provider-adapters";
import { NormalModelRuntime } from "../services/runtime/model-runtime";
import { GenerationRunError, logGenerationRun } from "../services/runtime/generation-run";
import type { GenerationContext } from "./chat-generation";
import { createStreamFlusher, parseToolArgs, type ContentAccumulator } from "./generation-helpers";

const MAX_TOOL_ROUNDS = 5;

/** Execute a single tool call against built-in tools or MCP */
async function executeOneTool(
  name: string,
  args: Record<string, unknown>,
  builtInEnabledByName: Record<string, boolean>,
  identity: any,
  allowedBuiltInToolNames: Set<string> | null,
  allowedServerIds: string[] | undefined,
  toolContext: ToolContext | undefined,
  approvalContext: {
    conversationId: string;
    participantName: string;
    modelName: string;
    availableTools: Map<string, string | undefined>;
  },
): Promise<{ toolCallId?: string; content: string }> {
  const description = approvalContext.availableTools.get(name);
  if (!approvalContext.availableTools.has(name)) return { content: `Tool not found: ${name}` };

  const risk = /^(read_|get_|list_|search_|git_status|git_diff|git_log)/.test(name)
    ? "read"
    : /^(edit_|write_|delete_|apply_|git_)/.test(name)
      ? "write"
      : "network";
  const approved = await toolApproval.request({
    toolName: name,
    description,
    args,
    conversationId: approvalContext.conversationId,
    participantName: approvalContext.participantName,
    modelName: approvalContext.modelName,
    risk,
  });
  if (!approved) return { content: `Tool call rejected by user: ${name}` };

  const builtInGloballyEnabled = builtInEnabledByName[name] !== false;
  const builtInEnabledForIdentity =
    !!identity && allowedBuiltInToolNames != null && allowedBuiltInToolNames.has(name);
  const builtIn =
    builtInGloballyEnabled || builtInEnabledForIdentity
      ? await executeBuiltInTool(name, args, toolContext)
      : null;
  if (builtIn) return { content: builtIn.success ? builtIn.content : `Error: ${builtIn.error}` };

  try {
    const remote = await executeMcpToolByName(name, args, allowedServerIds);
    if (remote) return { content: remote.success ? remote.content : `Error: ${remote.error}` };
  } catch (error) {
    return {
      content: `Error: ${error instanceof Error ? error.message : "MCP tool execution failed"}`,
    };
  }
  return { content: `Tool not found: ${name}` };
}

export async function runToolCallLoop(
  ctx: GenerationContext,
  assistantMsgId: string,
  acc: ContentAccumulator,
  fullReasoning: string,
  apiMessages: any[],
  adapter: ProviderAdapter,
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
  toolContext?: ToolContext,
  providerId = "unknown-provider",
): Promise<{ content: string; tokenUsage: { inputTokens: number; outputTokens: number } | null }> {
  const availableTools = new Map<string, string | undefined>();
  for (const definition of [...getBuiltInToolDefs(toolContext), ...toolDefs]) {
    const tool = "function" in definition ? definition.function : definition;
    if (typeof tool?.name === "string") {
      availableTools.set(
        tool.name,
        typeof tool.description === "string" ? tool.description : undefined,
      );
    }
  }
  const participant = ctx.conversation.participants.find(
    (candidate) => candidate.modelId === modelId,
  );
  const approvalContext = {
    conversationId: ctx.cid,
    participantName: participant?.nickname ?? modelId,
    modelName: modelId,
    availableTools,
  };

  await updateMessage(assistantMsgId, {
    content: acc.fullContent,
    reasoningContent: fullReasoning || null,
    reasoningDuration: null,
    generatedImages: acc.images,
    toolCalls: acc.pendingToolCalls,
  });
  notifyDbChange("messages", ctx.cid);

  const allToolCalls = [...acc.pendingToolCalls];
  const allToolResults: { toolCallId: string; content: string }[] = [];
  let currentToolCalls = acc.pendingToolCalls;
  let accumulatedContent = acc.fullContent;
  const generatedImages = [...acc.images];
  let currentTokenUsage = tokenUsage;
  const toolMessages = [...apiMessages];
  const runtime = new NormalModelRuntime(() => adapter);

  const executeCalls = async (calls: typeof currentToolCalls) => {
    const results: { toolCallId: string; content: string }[] = [];
    for (const call of calls) {
      const result = await executeOneTool(
        call.name,
        parseToolArgs(call.arguments),
        builtInEnabledByName,
        identity,
        allowedBuiltInToolNames,
        allowedServerIds,
        toolContext,
        approvalContext,
      );
      results.push({ toolCallId: call.id, content: result.content });
    }
    return results;
  };

  let currentToolResults = await executeCalls(currentToolCalls);
  allToolResults.push(...currentToolResults);
  await updateMessage(assistantMsgId, { toolResults: allToolResults });
  notifyDbChange("messages", ctx.cid);

  if (currentToolCalls.length === 0) {
    await updateMessage(assistantMsgId, {
      content: accumulatedContent,
      generatedImages,
      isStreaming: false,
      status: MessageStatus.SUCCESS,
      tokenUsage: currentTokenUsage,
    });
    return { content: accumulatedContent, tokenUsage: currentTokenUsage };
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    toolMessages.push(
      {
        role: "assistant" as const,
        content: accumulatedContent || null,
        tool_calls: currentToolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      },
      ...currentToolResults.map((result) => ({
        role: "tool" as const,
        tool_call_id: result.toolCallId,
        content: result.content,
      })),
    );

    ctx.streamingMessages.set(assistantMsgId, {
      cid: ctx.cid,
      messageId: assistantMsgId,
      content: accumulatedContent,
      reasoning: fullReasoning,
      images: generatedImages,
    });
    if (ctx.cid === ctx.getCurrentConversationId()) {
      const all = Array.from(ctx.streamingMessages.values()).filter(
        (state) => state.cid === ctx.cid,
      );
      ctx.setStoreState({ streamingMessages: all });
    }

    let toolContent = accumulatedContent;
    const newToolCalls: { id: string; name: string; arguments: string }[] = [];
    const toolCallIndexById = new Map<string, number>();
    const flusher = createStreamFlusher(
      ctx,
      assistantMsgId,
      () => toolContent,
      () => fullReasoning,
      () => generatedImages,
    );
    const runId = `${assistantMsgId}:tool:${round + 1}`;
    const runStartedAt = Date.now();
    const runContext = { runId, providerId, modelId, round: round + 1 };
    logGenerationRun({ ...runContext, event: "started" });
    for await (const event of runtime.run({
      runId,
      baseUrl,
      headers,
      modelId,
      messages: toolMessages,
      identity,
      reasoningEffort,
      toolDefs,
      signal: ctx.abortController.signal,
    })) {
      if (event.type === "text-delta") {
        toolContent += event.text;
        flusher.schedule();
      } else if (event.type === "image-generated") {
        generatedImages.push(event.url);
        flusher.schedule();
      } else if (event.type === "tool-call-started") {
        toolCallIndexById.set(event.callId, newToolCalls.length);
        newToolCalls.push({ id: event.callId, name: event.name, arguments: "" });
      } else if (event.type === "tool-call-arguments-delta") {
        const index = toolCallIndexById.get(event.callId);
        if (index === undefined) throw new Error(`Unknown tool call event: ${event.callId}`);
        newToolCalls[index].arguments += event.delta;
      } else if (event.type === "usage") {
        currentTokenUsage = {
          inputTokens: (currentTokenUsage?.inputTokens ?? 0) + event.usage.inputTokens,
          outputTokens: (currentTokenUsage?.outputTokens ?? 0) + event.usage.outputTokens,
        };
      } else if (event.type === "run-failed") {
        if (event.error.code === "aborted") {
          throw new DOMException(event.error.message, "AbortError");
        }
        logGenerationRun({
          ...runContext,
          event: "failed",
          durationMs: Date.now() - runStartedAt,
          errorCode: event.error.code,
          retryable: event.error.retryable,
        });
        throw new GenerationRunError(event.error);
      }
    }
    flusher.flush();
    logGenerationRun({
      ...runContext,
      event: "completed",
      durationMs: Date.now() - runStartedAt,
    });
    accumulatedContent = toolContent;

    if (newToolCalls.length === 0) break;
    allToolCalls.push(...newToolCalls);
    await updateMessage(assistantMsgId, { content: accumulatedContent, toolCalls: allToolCalls });
    notifyDbChange("messages", ctx.cid);

    const newResults = await executeCalls(newToolCalls);
    allToolResults.push(...newResults);
    await updateMessage(assistantMsgId, { toolResults: allToolResults });
    notifyDbChange("messages", ctx.cid);
    currentToolCalls = newToolCalls;
    currentToolResults = newResults;
  }

  await updateMessage(assistantMsgId, {
    content: accumulatedContent,
    generatedImages,
    isStreaming: false,
    status: MessageStatus.SUCCESS,
    tokenUsage: currentTokenUsage,
  });
  return { content: accumulatedContent, tokenUsage: currentTokenUsage };
}
