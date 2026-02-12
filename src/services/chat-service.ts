import type {
  Conversation,
  Message,
  MessageRole,
  ChatApiMessage,
  ChatApiToolDef,
  Identity,
} from "../types";
import { generateId } from "../utils/id";
import { ApiClient } from "./api-client";
import { executeTool, toolToApiDef } from "./mcp-client";
import {
  insertMessage,
  updateMessage as dbUpdateMessage,
  updateConversation as dbUpdateConversation,
} from "../storage/database";
import { useProviderStore } from "../stores/provider-store";
import { useIdentityStore } from "../stores/identity-store";
import { useChatStore } from "../stores/chat-store";
import { logger } from "./logger";

const log = logger.withContext("ChatService");

export function resolveTargetModels(
  conv: Conversation,
  mentionedModelIds?: string[],
): string[] {
  if (conv.type === "single") {
    if (!conv.participants[0]) return [];
    return [conv.participants[0].modelId];
  }
  if (mentionedModelIds && mentionedModelIds.length > 0) {
    return mentionedModelIds;
  }
  return conv.participants.map((p) => p.modelId);
}

export async function generateResponse(
  conversationId: string,
  modelId: string,
  conv: Conversation,
): Promise<void> {
  const providerStore = useProviderStore.getState();
  const identityStore = useIdentityStore.getState();
  const chatStore = useChatStore.getState();

  const model = providerStore.getModelById(modelId);
  if (!model) {
    log.warn(`Model not found: ${modelId}`);
    return;
  }

  const provider = providerStore.getProviderById(model.providerId);
  if (!provider) {
    log.warn(`Provider not found: ${model.providerId}`);
    return;
  }

  const participant = conv.participants.find((p) => p.modelId === modelId);
  const identity: Identity | undefined = participant?.identityId
    ? identityStore.getIdentityById(participant.identityId)
    : undefined;

  const apiMessages = buildApiMessages(chatStore.messages, modelId, identity);
  const tools = buildTools(identity);

  const assistantMsg: Message = {
    id: generateId(),
    conversationId,
    role: "assistant",
    senderModelId: modelId,
    senderName: model.displayName,
    identityId: identity?.id ?? null,
    content: "",
    reasoningContent: null,
    reasoningDuration: null,
    toolCalls: [],
    toolResults: [],
    branchId: chatStore.activeBranchId,
    parentMessageId: null,
    isStreaming: true,
    createdAt: new Date().toISOString(),
  };

  await insertMessage(assistantMsg);
  useChatStore.setState((s) => ({
    messages: [...s.messages, assistantMsg],
  }));

  const client = new ApiClient(provider);

  try {
    const stream = client.streamChat({
      model: model.modelId,
      messages: apiMessages,
      stream: true,
      temperature: identity?.params.temperature,
      top_p: identity?.params.topP,
      tools: tools.length > 0 ? tools : undefined,
    });

    let content = "";
    let reasoningContent = "";
    const pendingToolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
    }> = [];

    for await (const delta of stream) {
      if (delta.content) {
        content += delta.content;
      }
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content;
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!pendingToolCalls[tc.index]) {
            pendingToolCalls[tc.index] = {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: "",
            };
          }
          if (tc.id) pendingToolCalls[tc.index].id = tc.id;
          if (tc.function?.name) pendingToolCalls[tc.index].name = tc.function.name;
          if (tc.function?.arguments) {
            pendingToolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }

      useChatStore.setState((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content,
                reasoningContent: reasoningContent || null,
                toolCalls: pendingToolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                })),
              }
            : m,
        ),
      }));
    }

    const toolCallsSnapshot = pendingToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    }));
    let toolResults: Array<{ toolCallId: string; content: string }> = [];

    if (pendingToolCalls.length > 0) {
      toolResults = await executeToolCalls(pendingToolCalls);
      useChatStore.setState((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id ? { ...m, toolResults } : m,
        ),
      }));

      // Build follow-up messages: assistant (with tool_calls) + tool results
      const assistantApiMsg: ChatApiMessage = {
        role: "assistant",
        content: content || "",
        tool_calls: toolCallsSnapshot.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
      const toolApiMsgs: ChatApiMessage[] = toolResults.map((tr) => ({
        role: "tool" as MessageRole,
        content: tr.content,
        tool_call_id: tr.toolCallId,
      }));
      const followUpMessages: ChatApiMessage[] = [
        ...apiMessages,
        assistantApiMsg,
        ...toolApiMsgs,
      ];

      // Second-round: send tool results back for model to continue reasoning
      const followUpStream = client.streamChat({
        model: model.modelId,
        messages: followUpMessages,
        stream: true,
        temperature: identity?.params.temperature,
        top_p: identity?.params.topP,
      });

      let followUpContent = "";
      for await (const delta of followUpStream) {
        if (delta.content) {
          followUpContent += delta.content;
        }
        useChatStore.setState((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: followUpContent || content }
              : m,
          ),
        }));
      }

      if (followUpContent) {
        content = followUpContent;
      }
    }

    await dbUpdateMessage(assistantMsg.id, {
      content,
      reasoningContent: reasoningContent || null,
      toolCalls: toolCallsSnapshot,
      toolResults,
      isStreaming: false,
    });

    useChatStore.setState((s) => ({
      messages: s.messages.map((m) =>
        m.id === assistantMsg.id ? { ...m, content, isStreaming: false } : m,
      ),
    }));

    const now = new Date().toISOString();
    await dbUpdateConversation(conversationId, {
      lastMessage: content.slice(0, 100),
      lastMessageAt: now,
    });

    // P1-1: Sync conversations store so list view reflects AI reply
    useChatStore.setState((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: content.slice(0, 100), lastMessageAt: now, updatedAt: now }
          : c,
      ),
    }));

    log.info(`Response complete for model ${model.displayName}`);
  } catch (err) {
    log.error(`Stream error: ${err instanceof Error ? err.message : "Unknown"}`);
    const errorContent = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
    await dbUpdateMessage(assistantMsg.id, {
      content: errorContent,
      isStreaming: false,
    });
    useChatStore.setState((s) => ({
      messages: s.messages.map((m) =>
        m.id === assistantMsg.id
          ? { ...m, content: errorContent, isStreaming: false }
          : m,
      ),
    }));
  }
}

function buildApiMessages(
  messages: Message[],
  targetModelId: string,
  identity: Identity | undefined,
): ChatApiMessage[] {
  const apiMessages: ChatApiMessage[] = [];

  if (identity) {
    apiMessages.push({ role: "system", content: identity.systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === "system") continue;

    const apiMsg: ChatApiMessage = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.role === "assistant" && msg.senderModelId !== targetModelId && msg.senderName) {
      apiMsg.name = msg.senderName.replace(/[^a-zA-Z0-9_-]/g, "_");
      if (!apiMsg.name) {
        apiMsg.content = `[Note: The following was generated by ${msg.senderName}]\n${msg.content}`;
      }
    }

    apiMessages.push(apiMsg);
  }

  return apiMessages;
}

function buildTools(identity: Identity | undefined): ChatApiToolDef[] {
  const identityStore = useIdentityStore.getState();
  const allTools = [
    ...identityStore.getGlobalTools(),
    ...(identity ? identityStore.getToolsForIdentity(identity.id) : []),
  ];

  return allTools
    .map((t) => toolToApiDef(t))
    .filter((t): t is ChatApiToolDef => t !== null);
}

async function executeToolCalls(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
): Promise<Array<{ toolCallId: string; content: string }>> {
  const identityStore = useIdentityStore.getState();
  const results: Array<{ toolCallId: string; content: string }> = [];

  for (const tc of toolCalls) {
    const tool = identityStore.mcpTools.find(
      (t) => t.schema?.name === tc.name || t.name === tc.name,
    );

    if (!tool) {
      results.push({
        toolCallId: tc.id,
        content: `Tool not found: ${tc.name}`,
      });
      continue;
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments);
    } catch {
      // empty args
    }

    const result = await executeTool(tool, args);
    results.push({
      toolCallId: tc.id,
      content: result.success ? result.content : `Error: ${result.error}`,
    });
  }

  return results;
}
