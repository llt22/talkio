import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "../../types";
import { MessageStatus } from "../../types";

// Node has no localStorage — kv-store-backed stores (identity-store etc.)
// touch it at module load time, so the stub must exist before imports run.
vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;
});

const { mockGetConversation, mockGetRecentMessages, mockInsertMessage, mockUpdateConversation, mockNotifyDbChange } =
  vi.hoisted(() => ({
    mockGetConversation: vi.fn(),
    mockGetRecentMessages: vi.fn(),
    mockInsertMessage: vi.fn(),
    mockUpdateConversation: vi.fn(),
    mockNotifyDbChange: vi.fn(),
  }));

vi.mock("../../storage/database", () => ({
  getConversation: mockGetConversation,
  getRecentMessages: mockGetRecentMessages,
  insertMessage: mockInsertMessage,
  insertMessages: vi.fn(),
  updateConversation: mockUpdateConversation,
  updateMessage: vi.fn(),
}));

vi.mock("../../hooks/useDatabase", () => ({ notifyDbChange: mockNotifyDbChange }));

vi.mock("../provider-store", () => ({
  useProviderStore: {
    getState: () => ({
      getModelById: (id: string) => ({
        id,
        modelId: id,
        displayName: id,
        providerId: "provider-1",
        capabilities: { vision: false, toolCall: false, reasoning: false, streaming: true },
        maxContextLength: 128000,
        enabled: true,
        capabilitiesVerified: true,
        avatar: null,
      }),
      getProviderById: (id: string) => ({
        id,
        name: "Provider",
        type: "openai",
        apiFormat: "chat-completions",
        baseUrl: "https://example.com/v1",
        apiKey: "sk-test",
        customHeaders: [],
        enabled: true,
        status: "connected",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    }),
  },
}));

vi.mock("../settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { contextCompressionEnabled: false, contextCompressionThreshold: 0 },
    }),
  },
}));

vi.mock("../../services/workspace", () => ({
  buildWorkspaceContextBundle: vi.fn().mockResolvedValue({ files: [], tree: undefined }),
}));

const mockGenerateForParticipant = vi.hoisted(() => vi.fn());
vi.mock("../chat-generation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chat-generation")>();
  return {
    ...actual,
    generateForParticipant: mockGenerateForParticipant,
  };
});

import {
  buildApiMessagesForParticipant,
  createUserMessage,
} from "../chat-message-builder";
import { dispatchMessageGeneration } from "../chat-dispatch";
import type { StreamingState } from "../chat-generation";

function makeConversation(): Conversation {
  return {
    id: "conversation-1",
    type: "group",
    title: "Discussion",
    participants: [
      { id: "host-1", modelId: "model-a", identityId: null },
      { id: "member-2", modelId: "model-b", identityId: null },
    ],
    lastMessage: null,
    lastMessageAt: null,
    pinned: false,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    conversationId: "conversation-1",
    role: "assistant",
    senderModelId: "model-a",
    senderName: "Model A",
    identityId: null,
    participantId: "host-1",
    content: "hello",
    images: [],
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
    createdAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

const dispatchArgs = {
  conversationId: "conversation-1",
  text: "",
  activeBranchId: null,
  getCurrentConversationId: () => "conversation-1",
  abortControllers: new Map<string, AbortController>(),
  streamingMessages: new Map<string, StreamingState>(),
  setStoreState: vi.fn(),
};

describe("moderator summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversation.mockResolvedValue(makeConversation());
    mockGetRecentMessages.mockResolvedValue([
      makeMessage({ id: "m1", content: "earlier message" }),
    ]);
    mockGenerateForParticipant.mockResolvedValue("summary text");
    mockUpdateConversation.mockResolvedValue(undefined);
    mockInsertMessage.mockResolvedValue(undefined);
  });

  describe("buildApiMessagesForParticipant", () => {
    it("filters summary-request messages out of the discussion context", () => {
      const conv = makeConversation();
      const messages = [
        makeMessage({ id: "m1", role: "user", content: "normal question", status: MessageStatus.SUCCESS }),
        makeMessage({
          id: "m2",
          role: "user",
          content: "🎙️ summary request",
          status: MessageStatus.SUCCESS,
          kind: "summary-request",
        }),
      ];
      const apiMessages = buildApiMessagesForParticipant(messages, conv.participants[0], conv);
      const userContents = apiMessages
        .filter((m) => m.role === "user")
        .map((m) => m.content as string);
      expect(userContents).toEqual(["[User said]: normal question"]);
    });

    it("injects the moderator instruction into the host system prompt", () => {
      const conv = makeConversation();
      const messages = [makeMessage({ id: "m1", content: "debate" })];
      const apiMessages = buildApiMessagesForParticipant(messages, conv.participants[0], conv, {
        moderatorSummaryInstruction: "You are the moderator.",
      });
      const systemPrompt = apiMessages.find((m) => m.role === "system")?.content as string;
      expect(systemPrompt).toContain("You are the moderator.");
    });

    it("keeps summary results as regular assistant context", () => {
      const conv = makeConversation();
      const messages = [
        makeMessage({ id: "m1", content: "debate" }),
        makeMessage({ id: "m2", content: "structured summary", kind: "summary" }),
      ];
      const apiMessages = buildApiMessagesForParticipant(messages, conv.participants[0], conv);
      const contents = apiMessages.filter((m) => m.role === "assistant").map((m) => m.content as string);
      expect(contents).toEqual(["debate", "structured summary"]);
    });
  });

  describe("createUserMessage", () => {
    it("carries the summary-request kind", () => {
      const msg = createUserMessage("id-1", "conversation-1", "text", [], null, "summary-request");
      expect(msg.kind).toBe("summary-request");
    });
  });

  describe("dispatchMessageGeneration", () => {
    it("persists a summary-request message and generates exactly one host reply", async () => {
      await dispatchMessageGeneration({
        ...dispatchArgs,
        text: "🎙️ request",
        options: { targetParticipantIds: ["host-1"], moderatorSummary: true },
      });

      expect(mockInsertMessage).toHaveBeenCalled();
      const inserted = mockInsertMessage.mock.calls.map((c: any[]) => c[0]);
      const requestMsg = inserted.find((m: Message) => m.kind === "summary-request");
      expect(requestMsg).toBeDefined();
      expect(requestMsg.role).toBe("user");

      // Exactly one host generation — no @ propagation rounds.
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
      const [ctx, participant] = mockGenerateForParticipant.mock.calls[0];
      expect(participant.id).toBe("host-1");
      expect(ctx.moderatorSummary).toBe(true);
    });

    it("keeps moderator semantics when a summary result is regenerated (reuse without options)", async () => {
      mockGetRecentMessages.mockResolvedValue([
        makeMessage({
          id: "old-request",
          role: "user",
          content: "🎙️ request",
          status: MessageStatus.SUCCESS,
          kind: "summary-request",
        }),
      ]);

      await dispatchMessageGeneration({
        ...dispatchArgs,
        text: "irrelevant",
        options: { reuseUserMessageId: "old-request", targetParticipantIds: ["host-1"] },
      });

      // The kind on the persisted request message is the single source of truth.
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
      const [ctx] = mockGenerateForParticipant.mock.calls[0];
      expect(ctx.moderatorSummary).toBe(true);
    });
  });
});
