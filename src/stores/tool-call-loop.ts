/**
 * Multi-round tool call loop — extracted from chat-generation.ts.
 * Handles iterative tool execution and follow-up streaming.
 */
import { MessageStatus } from "../types";
import { updateMessage } from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { executeBuiltInTool } from "../services/built-in-tools";
import { executeMcpToolByName } from "../services/mcp";
import type { ProviderAdapter } from "../services/provider-adapters";
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
    ctx.streamingMessages.set(assistantMsgId, {
      cid: ctx.cid,
      messageId: assistantMsgId,
      content: accumulatedContent,
      reasoning: fullReasoning,
    });
    if (ctx.cid === ctx.getCurrentConversationId()) {
      const all = Array.from(ctx.streamingMessages.values()).filter((s) => s.cid === ctx.cid);
      ctx.setStoreState({ streamingMessages: all });
    }

    let toolContent = accumulatedContent;
    const newToolCalls: { id: string; name: string; arguments: string }[] = [];
    const flusher = createStreamFlusher(
      ctx,
      assistantMsgId,
      () => toolContent,
      () => fullReasoning,
    );

    const { usage: sseUsage } = await adapter.streamChat({
      baseUrl,
      headers,
      modelId,
      messages: toolMessages,
      identity,
      reasoningEffort,
      toolDefs,
      signal: ctx.abortController.signal,
      onDelta: (delta) => {
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
      },
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
