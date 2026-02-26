/**
 * Chat Store — manages conversations and streaming SSE.
 * Uses SQLite for persistence + in-memory streaming state.
 * rAF-throttled UI updates for smooth streaming.
 */
import { create } from "zustand";
import type { Message, Conversation, ConversationParticipant, Provider } from "../types";
import { MessageStatus } from "../types";
import { useIdentityStore } from "./identity-store";
import {
  resolveTargetParticipants,
  buildApiMessagesForParticipant,
  createUserMessage,
  createAssistantMessage,
} from "./chat-message-builder";
import {
  insertConversation,
  updateConversation,
  deleteConversation as dbDeleteConversation,
  getConversation,
  insertMessage,
  getRecentMessages,
  deleteMessage as dbDeleteMessage,
  clearMessages as dbClearMessages,
  insertMessages,
  updateMessage,
} from "../storage/database";
import { notifyDbChange } from "../hooks/useDatabase";
import { useProviderStore } from "./provider-store";
import { getBuiltInToolDefs, executeBuiltInTool } from "../services/built-in-tools";
import { executeMcpToolByName, getMcpToolDefsForIdentity, refreshMcpConnections } from "../services/mcp";
import { generateId } from "../lib/id";
import { consumeOpenAIChatCompletionsSse } from "../services/openai-chat-sse";
import { buildProviderHeaders } from "../services/provider-headers";
import { useBuiltInToolsStore } from "./built-in-tools-store";
import i18n from "../i18n";

const MAX_HISTORY = 200;

interface StreamingState {
  messageId: string;
  content: string;
  reasoning: string;
}

export interface ChatState {
  currentConversationId: string | null;
  isGenerating: boolean;
  _abortController: AbortController | null;
  activeBranchId: string | null;
  autoDiscussRemaining: number;
  autoDiscussTotalRounds: number;

  // In-memory streaming state — not persisted, used for rAF updates
  streamingMessage: StreamingState | null;

  createConversation: (modelId: string, extraModelIds?: string[]) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  sendMessage: (text: string, images?: string[], options?: { reuseUserMessageId?: string; mentionedModelIds?: string[] }) => Promise<void>;
  stopGeneration: () => void;
  startAutoDiscuss: (rounds: number, topicText?: string) => Promise<void>;
  stopAutoDiscuss: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  branchFromMessage: (messageId: string, messages: Message[]) => Promise<string>;
  switchBranch: (branchId: string | null) => void;
  deleteMessageById: (messageId: string) => Promise<void>;
  clearConversationMessages: (conversationId: string) => Promise<void>;
  searchAllMessages: (query: string) => Promise<Message[]>;
  updateParticipantIdentity: (conversationId: string, participantId: string, identityId: string | null) => Promise<void>;
  updateParticipantModel: (conversationId: string, participantId: string, modelId: string) => Promise<void>;
  addParticipant: (conversationId: string, modelId: string) => Promise<void>;
  removeParticipant: (conversationId: string, participantId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversationId: null,
  isGenerating: false,
  _abortController: null,
  activeBranchId: null,
  autoDiscussRemaining: 0,
  autoDiscussTotalRounds: 0,
  streamingMessage: null,

  createConversation: async (modelId: string, extraModelIds?: string[]) => {
    const providerStore = useProviderStore.getState();
    const model = providerStore.getModelById(modelId);
    const allIds = [modelId, ...(extraModelIds ?? [])];
    const participants: ConversationParticipant[] = allIds.map((mid) => ({
      id: generateId(),
      modelId: mid,
      identityId: null,
    }));
    const isGroup = participants.length > 1;
    const conv: Conversation = {
      id: generateId(),
      type: isGroup ? "group" : "single",
      title: isGroup ? (model?.displayName ?? i18n.t("chats.groupChat", { defaultValue: "Group Chat" })) : (model?.displayName ?? i18n.t("chats.newChat", { defaultValue: "New Chat" })),
      participants,
      lastMessage: null,
      lastMessageAt: null,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await insertConversation(conv);
    set({ currentConversationId: conv.id });
    notifyDbChange("conversations");
    return conv;
  },

  deleteConversation: async (id: string) => {
    await dbDeleteConversation(id);
    if (get().currentConversationId === id) {
      set({ currentConversationId: null });
    }
    notifyDbChange("conversations");
  },

  setCurrentConversation: (id: string | null) => {
    if (id !== get().currentConversationId) {
      set({ currentConversationId: id });
    }
  },

  sendMessage: async (text: string, images?: string[], options?: { reuseUserMessageId?: string; mentionedModelIds?: string[] }) => {
    const convId = get().currentConversationId;
    if (!convId) return;

    const conv = await getConversation(convId);
    if (!conv) return;
    // convId and conv are guaranteed non-null below this point
    const cid: string = convId;
    const conversation: Conversation = conv;

    // Helper functions extracted to chat-message-builder.ts

    const providerStore = useProviderStore.getState();

    let userMsg: Message;
    if (options?.reuseUserMessageId) {
      const all = await getRecentMessages(convId, null, MAX_HISTORY);
      const existing = all.find((m) => m.id === options.reuseUserMessageId);
      if (!existing || existing.role !== "user") return;
      userMsg = existing;
    } else {
      userMsg = createUserMessage(generateId(), cid, text, images ?? [], get().activeBranchId);
      await insertMessage(userMsg);
      updateConversation(cid, { lastMessage: text, lastMessageAt: userMsg.createdAt }).catch(() => {});
      notifyDbChange("messages", cid);
      notifyDbChange("conversations");
    }

    const abortController = new AbortController();
    set({ isGenerating: true, _abortController: abortController });

    const targets = resolveTargetParticipants(conversation, options?.mentionedModelIds);
    let lastAssistantContent = "";
    let firstModelDisplayName: string | null = null;

    async function generateForParticipant(participant: ConversationParticipant, index: number) {
      const model = providerStore.getModelById(participant.modelId);
      const provider = model ? providerStore.getProviderById(model.providerId) : null;
      if (!model || !provider) return;
      if (!firstModelDisplayName) firstModelDisplayName = model.displayName;

      if (provider.type !== "openai") {
        const assistantMsgId = generateId();
        const assistantMsg: Message = {
          id: assistantMsgId,
          conversationId: cid,
          role: "assistant",
          senderModelId: model.id,
          senderName: model.displayName,
          identityId: participant.identityId,
          participantId: participant.id,
          content: "",
          images: [],
          generatedImages: [],
          reasoningContent: null,
          reasoningDuration: null,
          toolCalls: [],
          toolResults: [],
          branchId: get().activeBranchId,
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
          createdAt: new Date(Date.parse(userMsg.createdAt) + 1 + index).toISOString(),
        };
        await insertMessage(assistantMsg);
        notifyDbChange("messages", cid);
        return;
      }

      const identity = participant.identityId
        ? useIdentityStore.getState().getIdentityById(participant.identityId)
        : null;

      const allowedBuiltInToolNames = identity ? new Set(identity.mcpToolIds ?? []) : null;
      const allowedServerIds = identity?.mcpServerIds?.length ? identity.mcpServerIds : undefined;

      const builtInEnabledByName = useBuiltInToolsStore.getState().enabledByName;

      let senderName = model.displayName;
      if (identity?.name) {
        senderName = `${model.displayName}（${identity.name}）`;
      }

      const assistantMsgId = generateId();
      const assistantMsg = createAssistantMessage(
        assistantMsgId, cid, model.id, senderName,
        participant.id, participant.identityId, get().activeBranchId,
        new Date(Date.parse(userMsg.createdAt) + 1 + index).toISOString(),
      );

      await insertMessage(assistantMsg);
      notifyDbChange("messages", cid);
      set({ streamingMessage: { messageId: assistantMsgId, content: "", reasoning: "" } });

      const baseUrl = provider.baseUrl.replace(/\/+$/, "");
      const headers = buildProviderHeaders(provider, { "Content-Type": "application/json" });
      await refreshMcpConnections().catch(() => {});

      const builtInToolDefs = (() => {
        const defs = getBuiltInToolDefs();
        const selected = allowedBuiltInToolNames ?? new Set<string>();
        return defs.filter((d) => {
          const name = d.function.name;
          const globallyEnabled = builtInEnabledByName[name] !== false;
          const enabledForIdentity = !!identity && selected.has(name);
          return globallyEnabled || enabledForIdentity;
        });
      })();

      const toolDefs = [...builtInToolDefs, ...getMcpToolDefsForIdentity(identity)];

      try {
        const allMessages = await getRecentMessages(cid, get().activeBranchId, MAX_HISTORY);
        const filtered = allMessages.filter((m) => m.status === MessageStatus.SUCCESS || m.id === userMsg.id);
        const apiMessages = buildApiMessagesForParticipant(filtered, participant, conversation);

        // Auto-detect reasoning models and send reasoning_effort
        const reasoningEffort = identity?.params?.reasoningEffort
          || (model.capabilities?.reasoning ? "medium" : undefined);

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model.modelId,
            messages: apiMessages,
            stream: true,
            ...(identity?.params?.temperature !== undefined ? { temperature: identity.params.temperature } : {}),
            ...(identity?.params?.topP !== undefined ? { top_p: identity.params.topP } : {}),
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        let fullContent = "";
        let fullReasoning = "";
        let inThinkTag = false;
        let rafPending = false;
        let dirty = false;
        const startTime = Date.now();
        const pendingToolCalls: { id: string; name: string; arguments: string }[] = [];

        function flushToUI() {
          rafPending = false;
          if (!dirty) return;
          dirty = false;
          set({
            streamingMessage: {
              messageId: assistantMsgId,
              content: fullContent,
              reasoning: fullReasoning,
            },
          });
        }

        function scheduleFlush() {
          dirty = true;
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushToUI);
          }
        }

        await consumeOpenAIChatCompletionsSse(reader, (delta) => {
          // Reasoning: support multiple field names used by different providers
          const rc = delta.reasoning_content ?? delta.reasoning;
          if (rc) fullReasoning += rc;

          // Content: parse <think> tags (DeepSeek, Hunyuan, etc.)
          if (delta.content) {
            let chunk = delta.content as string;
            while (chunk.length > 0) {
              if (inThinkTag) {
                const closeIdx = chunk.indexOf("</think>");
                if (closeIdx !== -1) {
                  fullReasoning += chunk.slice(0, closeIdx);
                  chunk = chunk.slice(closeIdx + 8);
                  inThinkTag = false;
                } else {
                  fullReasoning += chunk;
                  chunk = "";
                }
              } else {
                const openIdx = chunk.indexOf("<think>");
                if (openIdx !== -1) {
                  fullContent += chunk.slice(0, openIdx);
                  chunk = chunk.slice(openIdx + 7);
                  inThinkTag = true;
                } else {
                  fullContent += chunk;
                  chunk = "";
                }
              }
            }
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              while (pendingToolCalls.length <= idx) {
                pendingToolCalls.push({ id: "", name: "", arguments: "" });
              }
              if (tc.id) pendingToolCalls[idx].id = tc.id;
              if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx].arguments += tc.function.arguments;
            }
          }
          scheduleFlush();
        });

        flushToUI();
        const duration = (Date.now() - startTime) / 1000;

        if (pendingToolCalls.length > 0) {
          // Save toolCalls to the same assistant message (1:1 RN — single message holds everything)
          await updateMessage(assistantMsgId, {
            content: fullContent,
            reasoningContent: fullReasoning || null,
            reasoningDuration: fullReasoning ? duration : null,
            toolCalls: pendingToolCalls,
          });
          notifyDbChange("messages", cid);

          // Execute tools
          const toolResults: { toolCallId: string; content: string }[] = [];
          for (const tc of pendingToolCalls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.arguments); } catch {}
            const builtInGloballyEnabled = builtInEnabledByName[tc.name] !== false;
            const builtInEnabledForIdentity = !!identity && allowedBuiltInToolNames != null && allowedBuiltInToolNames.has(tc.name);
            const builtIn = (builtInGloballyEnabled || builtInEnabledForIdentity)
              ? await executeBuiltInTool(tc.name, args)
              : null;
            if (builtIn) {
              toolResults.push({ toolCallId: tc.id, content: builtIn.success ? builtIn.content : `Error: ${builtIn.error}` });
              continue;
            }
            const remote = await executeMcpToolByName(tc.name, args, allowedServerIds);
            if (remote) {
              toolResults.push({ toolCallId: tc.id, content: remote.success ? remote.content : `Error: ${remote.error}` });
              continue;
            }
            toolResults.push({ toolCallId: tc.id, content: `Tool not found: ${tc.name}` });
          }

          // Save toolResults to the same message
          await updateMessage(assistantMsgId, { toolResults });
          notifyDbChange("messages", cid);

          // Multi-round tool call loop (max 5 rounds to prevent infinite loops)
          let currentToolCalls = pendingToolCalls;
          let currentToolResults = toolResults;
          let accumulatedContent = fullContent;
          const MAX_TOOL_ROUNDS = 5;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            // Build follow-up request with tool results
            const toolMessages = [
              ...apiMessages,
              { role: "assistant" as const, content: accumulatedContent || null, tool_calls: currentToolCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } })) },
              ...currentToolResults.map((tr) => ({ role: "tool" as const, tool_call_id: tr.toolCallId, content: tr.content })),
            ];

            // Stream the follow-up response into the SAME message (1:1 RN pattern)
            set({ streamingMessage: { messageId: assistantMsgId, content: accumulatedContent, reasoning: fullReasoning } });

            const toolResponse = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model: model.modelId,
                messages: toolMessages,
                stream: true,
                ...(identity?.params?.temperature !== undefined ? { temperature: identity.params.temperature } : {}),
                ...(identity?.params?.topP !== undefined ? { top_p: identity.params.topP } : {}),
                ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
                ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
              }),
              signal: abortController.signal,
            });

            if (!toolResponse.ok) {
              const errText = await toolResponse.text();
              throw new Error(`API Error ${toolResponse.status}: ${errText}`);
            }
            const toolReader = toolResponse.body?.getReader();
            if (!toolReader) throw new Error("No response body");

            let toolContent = accumulatedContent;
            let newToolCalls: { id: string; name: string; arguments: string }[] = [];
            let toolRafPending = false;
            let toolDirty = false;

            function toolFlush() {
              toolRafPending = false;
              if (!toolDirty) return;
              toolDirty = false;
              set({ streamingMessage: { messageId: assistantMsgId, content: toolContent, reasoning: fullReasoning } });
            }
            function toolSchedule() {
              toolDirty = true;
              if (!toolRafPending) { toolRafPending = true; requestAnimationFrame(toolFlush); }
            }

            await consumeOpenAIChatCompletionsSse(toolReader, (delta) => {
              if (delta?.content) {
                toolContent += delta.content;
                toolSchedule();
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  while (newToolCalls.length <= idx) {
                    newToolCalls.push({ id: "", name: "", arguments: "" });
                  }
                  if (tc.id) newToolCalls[idx].id = tc.id;
                  if (tc.function?.name) newToolCalls[idx].name += tc.function.name;
                  if (tc.function?.arguments) newToolCalls[idx].arguments += tc.function.arguments;
                }
              }
            });
            toolFlush();

            accumulatedContent = toolContent;

            // If no new tool calls, we're done
            if (newToolCalls.length === 0) break;

            // Execute new tool calls
            await updateMessage(assistantMsgId, { content: accumulatedContent, toolCalls: [...(currentToolCalls), ...newToolCalls] });
            notifyDbChange("messages", cid);

            const newResults: { toolCallId: string; content: string }[] = [];
            for (const tc of newToolCalls) {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.arguments); } catch {}
              const builtInOk = builtInEnabledByName[tc.name] !== false || (!!identity && allowedBuiltInToolNames != null && allowedBuiltInToolNames.has(tc.name));
              const builtIn = builtInOk ? await executeBuiltInTool(tc.name, args) : null;
              if (builtIn) { newResults.push({ toolCallId: tc.id, content: builtIn.success ? builtIn.content : `Error: ${builtIn.error}` }); continue; }
              const remote = await executeMcpToolByName(tc.name, args, allowedServerIds);
              if (remote) { newResults.push({ toolCallId: tc.id, content: remote.success ? remote.content : `Error: ${remote.error}` }); continue; }
              newResults.push({ toolCallId: tc.id, content: `Tool not found: ${tc.name}` });
            }
            await updateMessage(assistantMsgId, { toolResults: [...currentToolResults, ...newResults] });
            notifyDbChange("messages", cid);

            // Update apiMessages for next round
            apiMessages.push(
              { role: "assistant" as const, content: accumulatedContent || null, tool_calls: newToolCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } })) },
              ...newResults.map((tr) => ({ role: "tool" as const, tool_call_id: tr.toolCallId, content: tr.content })),
            );

            currentToolCalls = newToolCalls;
            currentToolResults = newResults;
          }

          await updateMessage(assistantMsgId, {
            content: accumulatedContent,
            isStreaming: false,
            status: MessageStatus.SUCCESS,
          });

          lastAssistantContent = accumulatedContent;
        } else {
          await updateMessage(assistantMsgId, {
            content: fullContent,
            reasoningContent: fullReasoning || null,
            reasoningDuration: fullReasoning ? duration : null,
            isStreaming: false,
            status: MessageStatus.SUCCESS,
          });
          lastAssistantContent = fullContent;
        }

        const currentConv = await getConversation(cid);
        if (currentConv && firstModelDisplayName && currentConv.title === (firstModelDisplayName ?? "New Chat")) {
          const title = text.slice(0, 50) || "Chat";
          await updateConversation(cid, { title, lastMessage: (lastAssistantContent || text).slice(0, 100), lastMessageAt: new Date().toISOString() });
        } else {
          await updateConversation(cid, { lastMessage: (lastAssistantContent || text).slice(0, 100), lastMessageAt: new Date().toISOString() });
        }

        notifyDbChange("messages", cid);
        notifyDbChange("conversations");
      } catch (err: any) {
        if (err.name === "AbortError") {
          const sm = get().streamingMessage;
          if (sm && sm.messageId === assistantMsgId) {
            await updateMessage(assistantMsgId, {
              content: sm.content,
              reasoningContent: sm.reasoning || null,
              isStreaming: false,
              status: MessageStatus.SUCCESS,
            });
            notifyDbChange("messages", cid);
          }
        } else {
          await updateMessage(assistantMsgId, {
            isStreaming: false,
            status: MessageStatus.ERROR,
            errorMessage: err.message || "Unknown error",
          });
          notifyDbChange("messages", cid);
        }
      } finally {
        set({ streamingMessage: null });
      }
    }

    try {
      for (let i = 0; i < targets.length; i++) {
        if (abortController.signal.aborted) break;
        await generateForParticipant(targets[i], i);
      }
    } finally {
      set({ isGenerating: false, _abortController: null, streamingMessage: null });
    }
  },

  stopGeneration: () => {
    const ctrl = get()._abortController;
    if (ctrl) {
      ctrl.abort();
      set({ _abortController: null, autoDiscussRemaining: 0 });
    }
  },

  startAutoDiscuss: async (rounds: number, topicText?: string) => {
    const convId = get().currentConversationId;
    if (!convId) return;

    const conv = await getConversation(convId);
    if (!conv || conv.type !== "group" || conv.participants.length < 2) return;

    set({ autoDiscussRemaining: rounds, autoDiscussTotalRounds: rounds });

    // Wait for any in-progress generation to finish before starting
    while (get().isGenerating) {
      await new Promise((r) => setTimeout(r, 300));
      if (get().autoDiscussRemaining <= 0) return; // stopped while waiting
    }

    // First round: send topicText (or continue prompt) as user message
    const firstMsg = topicText?.trim() || i18n.t("chat.continue", { defaultValue: "Continue" });
    await get().sendMessage(firstMsg);

    // Subsequent rounds: auto-send continue prompt
    for (let round = 1; round < rounds; round++) {
      if (get().autoDiscussRemaining <= 0) break;
      set({ autoDiscussRemaining: rounds - round });
      await get().sendMessage(i18n.t("chat.continue", { defaultValue: "Continue" }));
    }

    set({ autoDiscussRemaining: 0, autoDiscussTotalRounds: 0 });
  },

  stopAutoDiscuss: () => {
    set({ autoDiscussRemaining: 0 });
    get().stopGeneration();
  },

  regenerateMessage: async (messageId: string) => {
    const convId = get().currentConversationId;
    if (!convId || get().isGenerating) return;

    const messages = await getRecentMessages(convId, get().activeBranchId, MAX_HISTORY);
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant") return;

    // Find the user message before this assistant message
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    const prevUserMsg = messages.slice(0, msgIndex).reverse().find((m) => m.role === "user");
    if (!prevUserMsg) return;

    // Delete the old assistant message
    await dbDeleteMessage(messageId);
    notifyDbChange("messages", convId);

    // Re-generate assistant response without creating a duplicate user message
    await get().sendMessage(prevUserMsg.content, prevUserMsg.images, { reuseUserMessageId: prevUserMsg.id });
  },

  deleteMessageById: async (messageId: string) => {
    await dbDeleteMessage(messageId);
    const convId = get().currentConversationId;
    if (convId) notifyDbChange("messages", convId);
    else notifyDbChange("all");
  },

  clearConversationMessages: async (conversationId: string) => {
    await dbClearMessages(conversationId);
    await updateConversation(conversationId, { lastMessage: null, lastMessageAt: null });
    notifyDbChange("messages", conversationId);
    notifyDbChange("conversations");
  },

  updateParticipantIdentity: async (conversationId: string, participantId: string, identityId: string | null) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.map((p) =>
      p.id === participantId ? { ...p, identityId } : p
    );
    await updateConversation(conversationId, { participants });
    notifyDbChange("conversations");
  },

  updateParticipantModel: async (conversationId: string, participantId: string, modelId: string) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const providerStore = useProviderStore.getState();
    const model = providerStore.getModelById(modelId);
    const participants = conv.participants.map((p) =>
      p.id === participantId ? { ...p, modelId } : p
    );
    await updateConversation(conversationId, {
      participants,
      title: model?.displayName ?? conv.title,
    });
    notifyDbChange("conversations");
  },

  addParticipant: async (conversationId: string, modelId: string) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const providerStore = useProviderStore.getState();
    const model = providerStore.getModelById(modelId);
    const newParticipant: ConversationParticipant = {
      id: generateId(),
      modelId,
      identityId: null,
    };
    const participants = [...conv.participants, newParticipant];
    const isFirstGroup = conv.type === "single" && participants.length > 1;
    await updateConversation(conversationId, {
      participants,
      type: isFirstGroup ? "group" : conv.type,
      title: isFirstGroup ? (model?.displayName ?? conv.title) : conv.title,
    });
    notifyDbChange("conversations");
  },

  removeParticipant: async (conversationId: string, participantId: string) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.filter((p) => p.id !== participantId);
    await updateConversation(conversationId, {
      participants,
      type: participants.length <= 1 ? "single" : "group",
    });
    notifyDbChange("conversations");
  },

  branchFromMessage: async (messageId: string, messages: Message[]) => {
    const branchId = generateId();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return branchId;
    const branchedMessages = messages.slice(0, msgIndex + 1).map((m) => ({
      ...m,
      id: generateId(),
      branchId,
    }));
    await insertMessages(branchedMessages);
    set({ activeBranchId: branchId });
    const convId = get().currentConversationId;
    if (convId) notifyDbChange("messages", convId);
    return branchId;
  },

  switchBranch: (branchId: string | null) => {
    set({ activeBranchId: branchId });
  },

  searchAllMessages: async (query: string) => {
    const { searchMessages } = await import("../storage/database");
    return searchMessages(query);
  },
}));
