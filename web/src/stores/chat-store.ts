/**
 * Chat Store — manages conversations and streaming SSE.
 * Uses SQLite for persistence + in-memory streaming state.
 * rAF-throttled UI updates for smooth streaming.
 */
import { create } from "zustand";
import type { Message, Conversation, ConversationParticipant, Provider } from "../../../src/types";
import { MessageStatus } from "../../../src/types";
import { useIdentityStore } from "./identity-store";
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

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface StreamingState {
  messageId: string;
  content: string;
  reasoning: string;
}

export interface ChatState {
  currentConversationId: string | null;
  isGenerating: boolean;
  _abortController: AbortController | null;

  // In-memory streaming state — not persisted, used for rAF updates
  streamingMessage: StreamingState | null;

  createConversation: (modelId: string, extraModelIds?: string[]) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  sendMessage: (text: string, images?: string[]) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  deleteMessageById: (messageId: string) => Promise<void>;
  clearConversationMessages: (conversationId: string) => Promise<void>;
  updateParticipantIdentity: (conversationId: string, participantId: string, identityId: string | null) => Promise<void>;
  updateParticipantModel: (conversationId: string, participantId: string, modelId: string) => Promise<void>;
  addParticipant: (conversationId: string, modelId: string) => Promise<void>;
  removeParticipant: (conversationId: string, participantId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversationId: null,
  isGenerating: false,
  _abortController: null,
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
      title: isGroup ? (model?.displayName ?? "Group Chat") : (model?.displayName ?? "New Chat"),
      participants,
      lastMessage: null,
      lastMessageAt: null,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await insertConversation(conv);
    set({ currentConversationId: conv.id });
    notifyDbChange();
    return conv;
  },

  deleteConversation: async (id: string) => {
    await dbDeleteConversation(id);
    if (get().currentConversationId === id) {
      set({ currentConversationId: null });
    }
    notifyDbChange();
  },

  setCurrentConversation: (id: string | null) => {
    if (id !== get().currentConversationId) {
      set({ currentConversationId: id });
    }
  },

  sendMessage: async (text: string, images?: string[]) => {
    const convId = get().currentConversationId;
    if (!convId) return;

    const conv = await getConversation(convId);
    if (!conv) return;

    function resolveTargetParticipants(): ConversationParticipant[] {
      if (conv.type === "single") {
        return conv.participants[0] ? [conv.participants[0]] : [];
      }
      return conv.participants;
    }

    function buildGroupRoster(selfParticipantId: string | null): string {
      const providerStore = useProviderStore.getState();
      const identityStore = useIdentityStore.getState();
      const lines = conv.participants.map((p) => {
        const model = providerStore.getModelById(p.modelId);
        const modelName = model?.displayName ?? p.modelId;
        const identity = p.identityId ? identityStore.getIdentityById(p.identityId) : null;
        const label = identity?.name ?? modelName;
        const isSelf = p.id === selfParticipantId;
        return `- ${label}${isSelf ? "  ← you" : ""}`;
      });
      return [
        "You are in a group chat with multiple AI participants and one human user.",
        "Participants:",
        ...lines,
        "",
        "The human user's messages appear as: [User said]: content",
        "Other AI participants' messages appear as: [Name said]: content",
        "Your own previous messages appear as role=assistant (no prefix).",
        "Always distinguish between the human user and other AI participants.",
        "Think independently — form your own opinions and do not simply agree with or echo others.",
        "If you disagree, say so directly and explain why. Constructive debate is encouraged.",
        "Do not repeat, summarize, or rephrase what others said unless asked.",
      ].join("\n");
    }

    function buildApiMessagesForParticipant(
      allMessages: Message[],
      participant: ConversationParticipant,
    ): any[] {
      const identity = participant.identityId
        ? useIdentityStore.getState().getIdentityById(participant.identityId)
        : null;

      const isGroup = conv.type === "group";
      const apiMessages: any[] = [];

      if (isGroup) {
        const roster = buildGroupRoster(participant.id);
        const groupPrompt = identity?.systemPrompt ? `${identity.systemPrompt}\n\n${roster}` : roster;
        apiMessages.push({ role: "system", content: groupPrompt });
      } else if (identity?.systemPrompt) {
        apiMessages.push({ role: "system", content: identity.systemPrompt });
      }

      for (const m of allMessages) {
        if (m.role !== "user" && m.role !== "assistant") continue;

        let role: "user" | "assistant" = m.role as any;
        let content: any = m.content;

        if (m.role === "user") {
          if (m.images && m.images.length > 0) {
            const parts: any[] = [];
            if (m.content) parts.push({ type: "text", text: m.content });
            for (const uri of m.images) {
              parts.push({ type: "image_url", image_url: { url: uri } });
            }
            content = parts;
          }
        }

        if (isGroup) {
          if (role === "user" && typeof content === "string") {
            content = `[User said]: ${content}`;
          }
          if (role === "assistant" && m.senderName) {
            const isSelf = m.participantId != null && m.participantId === participant.id;
            if (!isSelf) {
              role = "user";
              const prefix = `[${m.senderName} said]: `;
              if (typeof content === "string") content = prefix + content;
            }
          }
        }

        apiMessages.push({ role, content });
      }

      return apiMessages;
    }

    const providerStore = useProviderStore.getState();

    // Create and persist user message
    const userMsg: Message = {
      id: generateId(),
      conversationId: convId,
      role: "user",
      senderModelId: null,
      senderName: "You",
      identityId: null,
      participantId: null,
      content: text,
      images: images ?? [],
      generatedImages: [],
      reasoningContent: null,
      reasoningDuration: null,
      toolCalls: [],
      toolResults: [],
      branchId: null,
      parentMessageId: null,
      isStreaming: false,
      status: MessageStatus.SUCCESS,
      errorMessage: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
    };

    await insertMessage(userMsg);
    updateConversation(convId, { lastMessage: text, lastMessageAt: userMsg.createdAt }).catch(() => {});
    notifyDbChange();

    const abortController = new AbortController();
    set({ isGenerating: true, _abortController: abortController });

    const targets = resolveTargetParticipants();
    let lastAssistantContent = "";
    let firstModelDisplayName: string | null = null;

    const headersForProvider = (provider: Provider) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      };
      if (provider.customHeaders) {
        for (const h of provider.customHeaders) {
          if (h.name && h.value) headers[h.name] = h.value;
        }
      }
      return headers;
    };

    async function generateForParticipant(participant: ConversationParticipant, index: number) {
      const model = providerStore.getModelById(participant.modelId);
      const provider = model ? providerStore.getProviderById(model.providerId) : null;
      if (!model || !provider) return;
      if (!firstModelDisplayName) firstModelDisplayName = model.displayName;

      const assistantMsgId = generateId();
      const assistantMsg: Message = {
        id: assistantMsgId,
        conversationId: convId,
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
        branchId: null,
        parentMessageId: null,
        isStreaming: true,
        status: MessageStatus.STREAMING,
        errorMessage: null,
        tokenUsage: null,
        createdAt: new Date(Date.parse(userMsg.createdAt) + 1 + index).toISOString(),
      };

      await insertMessage(assistantMsg);
      notifyDbChange();
      set({ streamingMessage: { messageId: assistantMsgId, content: "", reasoning: "" } });

      const baseUrl = provider.baseUrl.replace(/\/+$/, "");
      const headers = headersForProvider(provider);
      const toolDefs = getBuiltInToolDefs();

      try {
        const allMessages = await getRecentMessages(convId, null, 200);
        const filtered = allMessages.filter((m) => m.status === MessageStatus.SUCCESS || m.id === userMsg.id);
        const apiMessages = buildApiMessagesForParticipant(filtered, participant);

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model.modelId,
            messages: apiMessages,
            stream: true,
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

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let fullReasoning = "";
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;
              if (delta.content) fullContent += delta.content;
              if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
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
            } catch {}
          }
        }

        flushToUI();
        const duration = (Date.now() - startTime) / 1000;

        if (pendingToolCalls.length > 0) {
          await updateMessage(assistantMsgId, {
            content: fullContent,
            reasoningContent: fullReasoning || null,
            reasoningDuration: fullReasoning ? duration : null,
            isStreaming: false,
            status: MessageStatus.SUCCESS,
            toolCalls: pendingToolCalls,
          });

          const toolResults: { toolCallId: string; content: string }[] = [];
          for (const tc of pendingToolCalls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.arguments); } catch {}
            const result = await executeBuiltInTool(tc.name, args);
            toolResults.push({
              toolCallId: tc.id,
              content: result ? (result.success ? result.content : `Error: ${result.error}`) : `Tool not found: ${tc.name}`,
            });
          }

          const toolMessages = [
            ...apiMessages,
            { role: "assistant" as const, content: fullContent || null, tool_calls: pendingToolCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } })) },
            ...toolResults.map((tr) => ({ role: "tool" as const, tool_call_id: tr.toolCallId, content: tr.content })),
          ];

          const toolResponseMsgId = generateId();
          const toolResponseMsg: Message = {
            id: toolResponseMsgId,
            conversationId: convId,
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
            toolResults,
            branchId: null,
            parentMessageId: null,
            isStreaming: true,
            status: MessageStatus.STREAMING,
            errorMessage: null,
            tokenUsage: null,
            createdAt: new Date().toISOString(),
          };
          await insertMessage(toolResponseMsg);
          notifyDbChange();

          set({ streamingMessage: { messageId: toolResponseMsgId, content: "", reasoning: "" } });

          const toolResponse = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: model.modelId,
              messages: toolMessages,
              stream: true,
            }),
            signal: abortController.signal,
          });

          if (!toolResponse.ok) throw new Error(`API Error ${toolResponse.status}`);
          const toolReader = toolResponse.body?.getReader();
          if (!toolReader) throw new Error("No response body");

          let toolBuffer = "";
          let toolContent = "";
          let toolRafPending = false;
          let toolDirty = false;

          function toolFlush() {
            toolRafPending = false;
            if (!toolDirty) return;
            toolDirty = false;
            set({ streamingMessage: { messageId: toolResponseMsgId, content: toolContent, reasoning: "" } });
          }
          function toolSchedule() {
            toolDirty = true;
            if (!toolRafPending) { toolRafPending = true; requestAnimationFrame(toolFlush); }
          }

          while (true) {
            const { done, value } = await toolReader.read();
            if (done) break;
            toolBuffer += new TextDecoder().decode(value, { stream: true });
            const lines = toolBuffer.split("\n");
            toolBuffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) { toolContent += delta.content; toolSchedule(); }
              } catch {}
            }
          }
          toolFlush();

          await updateMessage(toolResponseMsgId, {
            content: toolContent,
            isStreaming: false,
            status: MessageStatus.SUCCESS,
          });

          lastAssistantContent = toolContent;
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

        const currentConv = await getConversation(convId);
        if (currentConv && firstModelDisplayName && currentConv.title === (firstModelDisplayName ?? "New Chat")) {
          const title = text.slice(0, 50) || "Chat";
          await updateConversation(convId, { title, lastMessage: (lastAssistantContent || text).slice(0, 100), lastMessageAt: new Date().toISOString() });
        } else {
          await updateConversation(convId, { lastMessage: (lastAssistantContent || text).slice(0, 100), lastMessageAt: new Date().toISOString() });
        }

        notifyDbChange();
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
          }
        } else {
          await updateMessage(assistantMsgId, {
            isStreaming: false,
            status: MessageStatus.ERROR,
            errorMessage: err.message || "Unknown error",
          });
        }
        notifyDbChange();
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
      set({ _abortController: null });
    }
  },

  regenerateMessage: async (messageId: string) => {
    const convId = get().currentConversationId;
    if (!convId || get().isGenerating) return;

    const messages = await getRecentMessages(convId, null, 200);
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant") return;

    // Find the user message before this assistant message
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    const prevUserMsg = messages.slice(0, msgIndex).reverse().find((m) => m.role === "user");
    if (!prevUserMsg) return;

    // Delete the old assistant message
    await dbDeleteMessage(messageId);
    notifyDbChange();

    // Re-send
    await get().sendMessage(prevUserMsg.content);
  },

  deleteMessageById: async (messageId: string) => {
    await dbDeleteMessage(messageId);
    notifyDbChange();
  },

  clearConversationMessages: async (conversationId: string) => {
    await dbClearMessages(conversationId);
    await updateConversation(conversationId, { lastMessage: null, lastMessageAt: null });
    notifyDbChange();
  },

  updateParticipantIdentity: async (conversationId: string, participantId: string, identityId: string | null) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.map((p) =>
      p.id === participantId ? { ...p, identityId } : p
    );
    await updateConversation(conversationId, { participants });
    notifyDbChange();
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
    notifyDbChange();
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
    notifyDbChange();
  },

  removeParticipant: async (conversationId: string, participantId: string) => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const participants = conv.participants.filter((p) => p.id !== participantId);
    await updateConversation(conversationId, {
      participants,
      type: participants.length <= 1 ? "single" : "group",
    });
    notifyDbChange();
  },
}));
