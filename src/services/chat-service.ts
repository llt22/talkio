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
import { executeTool, toolToApiDef, discoverServerTools, executeServerTool, discoveredToolToApiDef } from "./mcp-client";
import type { DiscoveredTool, McpServer } from "../types";
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
  signal?: AbortSignal,
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
  log.info(`[generateResponse] Building tools for ${model.displayName}...`);
  let tools: ChatApiToolDef[] = [];
  try {
    tools = await buildTools(model, identity);
  } catch (err) {
    log.warn(`[generateResponse] buildTools failed, proceeding without tools: ${err instanceof Error ? err.message : err}`);
  }
  log.info(`[generateResponse] Tools ready: ${tools.length} tools`);

  const assistantMsg: Message = {
    id: generateId(),
    conversationId,
    role: "assistant",
    senderModelId: modelId,
    senderName: model.displayName,
    identityId: identity?.id ?? null,
    content: "",
    images: [],
    generatedImages: [],
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

  let content = "";
  let reasoningContent = "";
  const generatedImages: string[] = [];
  const pendingToolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }> = [];

  // Helper: always mark message as done (isStreaming=false), never throws
  const finishMessage = async (finalContent: string) => {
    try {
      await dbUpdateMessage(assistantMsg.id, { content: finalContent, isStreaming: false });
    } catch (e) {
      log.error(`DB update failed: ${e}`);
    }
    useChatStore.setState((s) => ({
      messages: s.messages.map((m) =>
        m.id === assistantMsg.id ? { ...m, content: finalContent, isStreaming: false } : m,
      ),
    }));
  };

  try {
    const client = new ApiClient(provider);

    // Build reasoning params if model supports it
    const effort = identity?.params.reasoningEffort ?? "auto";
    const reasoningParams: Record<string, unknown> = {};
    if (model.capabilities.reasoning && effort !== "none") {
      const mid = model.modelId.toLowerCase();
      if (mid.includes("claude")) {
        const budgetMap = { low: 4096, medium: 8192, high: 16384, auto: 8192 };
        reasoningParams.thinking = { type: "enabled", budget_tokens: budgetMap[effort] ?? 8192 };
      } else if (mid.includes("gemini") && mid.includes("thinking")) {
        const budgetMap = { low: 1024, medium: 4096, high: -1, auto: -1 };
        reasoningParams.extra_body = {
          google: { thinking_config: { thinking_budget: budgetMap[effort] ?? -1, include_thoughts: true } },
        };
      } else if (mid.includes("hunyuan")) {
        reasoningParams.enable_thinking = true;
      } else if (mid.match(/\b(o1|o3|o4)\b/) || mid.includes("grok") || mid.includes("perplexity")) {
        reasoningParams.reasoning_effort = effort === "auto" ? "medium" : effort;
      }
    }

    // o1/o3/o4 models don't support temperature, top_p, or system role
    const isOModel = /\b(o1|o3|o4)\b/.test(model.modelId.toLowerCase());
    const streamParams: Record<string, unknown> = {
      model: model.modelId,
      messages: isOModel
        ? apiMessages.map((m) =>
            m.role === "system" ? { ...m, role: "user" as const, content: `[System Instructions]\n${typeof m.content === "string" ? m.content : ""}` } : m,
          )
        : apiMessages,
      stream: true,
      ...(isOModel ? {} : {
        temperature: identity?.params.temperature,
        top_p: identity?.params.topP,
      }),
      tools: tools.length > 0 ? tools : undefined,
      ...reasoningParams,
    };
    // Remove undefined values to avoid sending them to the API
    for (const key of Object.keys(streamParams)) {
      if (streamParams[key] === undefined) delete streamParams[key];
    }
    log.info(`[generateResponse] Starting stream for ${model.modelId} to ${provider.baseUrl}...`);
    const stream = client.streamChat(streamParams as any, signal);

    let inThinkTag = false;

    // Process a text chunk: handle <think> tags
    const processTextChunk = (raw: string) => {
      let chunk = raw;
      while (chunk) {
        if (inThinkTag) {
          const closeIdx = chunk.indexOf("</think>");
          if (closeIdx !== -1) {
            reasoningContent += chunk.slice(0, closeIdx);
            chunk = chunk.slice(closeIdx + 8);
            inThinkTag = false;
          } else {
            reasoningContent += chunk;
            chunk = "";
          }
        } else {
          const openIdx = chunk.indexOf("<think>");
          if (openIdx !== -1) {
            content += chunk.slice(0, openIdx);
            chunk = chunk.slice(openIdx + 7);
            inThinkTag = true;
          } else {
            content += chunk;
            chunk = "";
          }
        }
      }
    };

    let chunkCount = 0;
    for await (const delta of stream) {
      chunkCount++;
      if (chunkCount === 1) log.info(`[generateResponse] First chunk received`);
      // Handle content: can be string or multimodal array
      if (delta.content != null) {
        if (typeof delta.content === "string") {
          processTextChunk(delta.content);
        } else if (Array.isArray(delta.content)) {
          for (const part of delta.content) {
            if (part.type === "text" && part.text) {
              processTextChunk(part.text);
            } else if (part.type === "image_url" && part.image_url?.url) {
              generatedImages.push(part.image_url.url);
            }
          }
        }
      }
      // Direct reasoning_content field (DeepSeek R1, etc.)
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content;
      }
      // Some providers use 'reasoning' field
      if ((delta as any).reasoning) {
        reasoningContent += (delta as any).reasoning;
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

      useChatStore.setState((s) => {
        const msgs = [...s.messages];
        const idx = msgs.length - 1;
        if (idx >= 0 && msgs[idx].id === assistantMsg.id) {
          msgs[idx] = {
            ...msgs[idx],
            content,
            generatedImages: [...generatedImages],
            reasoningContent: reasoningContent || null,
            toolCalls: pendingToolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            })),
          };
        }
        return { messages: msgs };
      });
    }

    // Post-stream: extract markdown images from content
    const mdImageRegex = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = mdImageRegex.exec(content)) !== null) {
      generatedImages.push(match[1]);
    }
    if (generatedImages.length > 0) {
      content = content.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, "").trim();
    }

    const toolCallsSnapshot = pendingToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    }));
    let toolResults: Array<{ toolCallId: string; content: string }> = [];

    if (pendingToolCalls.length > 0) {
      toolResults = await executeToolCalls(pendingToolCalls);
      useChatStore.setState((s) => {
        const msgs = [...s.messages];
        const idx = msgs.length - 1;
        if (idx >= 0 && msgs[idx].id === assistantMsg.id) {
          msgs[idx] = { ...msgs[idx], toolResults };
        }
        return { messages: msgs };
      });

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

      const followUpParams: Record<string, unknown> = {
        model: model.modelId,
        messages: followUpMessages,
        stream: true,
        ...(isOModel ? {} : {
          temperature: identity?.params.temperature,
          top_p: identity?.params.topP,
        }),
      };
      for (const key of Object.keys(followUpParams)) {
        if (followUpParams[key] === undefined) delete followUpParams[key];
      }
      const followUpStream = client.streamChat(followUpParams as any, signal);

      let followUpContent = "";
      for await (const delta of followUpStream) {
        if (delta.content) {
          followUpContent += delta.content;
        }
        useChatStore.setState((s) => {
          const msgs = [...s.messages];
          const idx = msgs.length - 1;
          if (idx >= 0 && msgs[idx].id === assistantMsg.id) {
            msgs[idx] = { ...msgs[idx], content: followUpContent || content };
          }
          return { messages: msgs };
        });
      }

      if (followUpContent) {
        content = followUpContent;
      }
    }

    await dbUpdateMessage(assistantMsg.id, {
      content,
      generatedImages,
      reasoningContent: reasoningContent || null,
      toolCalls: toolCallsSnapshot,
      toolResults,
      isStreaming: false,
    });

    useChatStore.setState((s) => {
      const msgs = [...s.messages];
      const idx = msgs.length - 1;
      if (idx >= 0 && msgs[idx].id === assistantMsg.id) {
        msgs[idx] = { ...msgs[idx], content, generatedImages: [...generatedImages], isStreaming: false };
      }
      return { messages: msgs };
    });

    const now = new Date().toISOString();
    await dbUpdateConversation(conversationId, {
      lastMessage: content.slice(0, 100),
      lastMessageAt: now,
    });

    useChatStore.setState((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: content.slice(0, 100), lastMessageAt: now, updatedAt: now }
          : c,
      ),
    }));

    // Auto-generate conversation title on first response
    log.info(`[generateResponse] Stream complete. ${chunkCount} chunks, ${content.length} chars`);
    autoGenerateTitle(conversationId, client, model, chatStore.messages, content).catch(() => {});
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : '';
    log.error(`Stream error for ${model.displayName}: ${errMsg}\n${errStack}`);

    if (signal?.aborted) {
      await finishMessage(content || "(stopped)");
      return;
    }
    await finishMessage(`[${model.displayName}] Error: ${errMsg}`);
  }
}

async function autoGenerateTitle(
  conversationId: string,
  client: ApiClient,
  model: { modelId: string; displayName: string },
  previousMessages: Message[],
  assistantContent: string,
): Promise<void> {
  // Only generate title if this is the first assistant message in the conversation
  const assistantCount = previousMessages.filter((m) => m.role === "assistant").length;
  if (assistantCount > 0) return; // already has prior responses

  const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  if (!conv) return;

  // Skip if title was manually set (not the default "Model Group" or model name pattern)
  const isDefaultTitle = conv.title.startsWith("Model Group") || conv.title === model.displayName;
  if (!isDefaultTitle) return;

  const userMsg = previousMessages.find((m) => m.role === "user");
  if (!userMsg) return;

  try {
    const resp = await client.chat({
      model: model.modelId,
      messages: [
        {
          role: "system",
          content: "Generate a very short title (3-8 words) for this conversation. Return ONLY the title text, no quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: `User: ${userMsg.content.slice(0, 300)}\n\nAssistant: ${assistantContent.slice(0, 300)}\n\nGenerate a short title for this conversation.`,
        },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 30,
    });

    const title = (resp.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    if (!title || title.length > 60) return;

    await dbUpdateConversation(conversationId, { title });
    useChatStore.setState((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, title } : c,
      ),
    }));
  } catch {
    // Non-critical, silently fail
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

    const hasImages = msg.images && msg.images.length > 0;

    const apiMsg: ChatApiMessage = {
      role: msg.role,
      content: hasImages
        ? [
            ...(msg.content ? [{ type: "text" as const, text: msg.content }] : []),
            ...msg.images.map((uri) => ({
              type: "image_url" as const,
              image_url: { url: uri },
            })),
          ]
        : msg.content,
    };

    if (msg.role === "assistant" && msg.senderModelId !== targetModelId && msg.senderName) {
      // Convert other models' responses to "user" role to avoid "must end with user message" errors
      apiMsg.role = "user";
      const prefix = `[${msg.senderName} said]: `;
      if (typeof apiMsg.content === "string") {
        apiMsg.content = prefix + apiMsg.content;
      }
    }

    apiMessages.push(apiMsg);
  }

  return apiMessages;
}

// Module-level cache: maps tool name → { server, tool } for routing executeToolCalls
let _discoveredToolsCache: Map<string, { server: McpServer; tool: DiscoveredTool }> = new Map();

async function buildTools(model: { capabilities: { toolCall: boolean } }, identity: Identity | undefined): Promise<ChatApiToolDef[]> {
  // Skip tools entirely if model doesn't support tool calls or no identity bound
  if (!model.capabilities.toolCall) return [];
  if (!identity) return [];

  const identityStore = useIdentityStore.getState();
  const seen = new Set<string>();
  const result: ChatApiToolDef[] = [];

  // 1. Built-in tools — only those explicitly bound to the identity
  const boundToolIds = new Set(identity.mcpToolIds);
  if (boundToolIds.size > 0) {
    const boundBuiltIn = identityStore.mcpTools.filter((t) => t.enabled && boundToolIds.has(t.id));
    for (const t of boundBuiltIn) {
      const def = toolToApiDef(t);
      if (def && !seen.has(def.function.name)) {
        seen.add(def.function.name);
        result.push(def);
      }
    }
  }

  // 2. Remote MCP servers — only those explicitly bound to the identity
  _discoveredToolsCache = new Map();
  const enabledServers = identity.mcpServerIds?.length
    ? identityStore.mcpServers.filter((s) => s.enabled && identity.mcpServerIds!.includes(s.id))
    : [];

  const DISCOVERY_TIMEOUT = 8000; // 8s per server
  for (const server of enabledServers) {
    try {
      log.info(`Discovering tools from ${server.name} (${server.url})...`);
      const tools = await Promise.race([
        discoverServerTools(server),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${DISCOVERY_TIMEOUT}ms`)), DISCOVERY_TIMEOUT),
        ),
      ]);
      log.info(`Discovered ${tools.length} tools from ${server.name}`);
      for (const tool of tools) {
        if (!seen.has(tool.name)) {
          seen.add(tool.name);
          result.push(discoveredToolToApiDef(tool));
          _discoveredToolsCache.set(tool.name, { server, tool });
        }
      }
    } catch (err) {
      log.warn(`Failed to discover tools from ${server.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}

async function executeToolCalls(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
): Promise<Array<{ toolCallId: string; content: string }>> {
  const identityStore = useIdentityStore.getState();
  const results: Array<{ toolCallId: string; content: string }> = [];

  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments);
    } catch { /* empty args */ }

    // Check remote tools cache first (from buildTools discovery)
    const remote = _discoveredToolsCache.get(tc.name);
    if (remote) {
      const EXEC_TIMEOUT = 30000; // 30s for tool execution
      try {
        const result = await Promise.race([
          executeServerTool(remote.server, tc.name, args),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool execution timeout after ${EXEC_TIMEOUT}ms`)), EXEC_TIMEOUT),
          ),
        ]);
        results.push({
          toolCallId: tc.id,
          content: result.success ? result.content : `Error: ${result.error}`,
        });
      } catch (err) {
        results.push({
          toolCallId: tc.id,
          content: `Error: ${err instanceof Error ? err.message : "Tool execution failed"}`,
        });
      }
      continue;
    }

    // Fallback: built-in tools
    const tcLower = tc.name.toLowerCase();
    const tool = identityStore.mcpTools.find((t) => {
      const schemaName = t.schema?.name?.toLowerCase() ?? "";
      const toolName = t.name.toLowerCase();
      return schemaName === tcLower || toolName === tcLower
        || toolName.replace(/\s+/g, "_") === tcLower;
    });

    if (!tool) {
      log.warn(`Tool not found: "${tc.name}". Built-in:`, identityStore.mcpTools.map((t) => t.schema?.name));
      results.push({ toolCallId: tc.id, content: `Tool not found: ${tc.name}` });
      continue;
    }

    const result = await executeTool(tool, args);
    results.push({
      toolCallId: tc.id,
      content: result.success ? result.content : `Error: ${result.error}`,
    });
  }

  return results;
}
