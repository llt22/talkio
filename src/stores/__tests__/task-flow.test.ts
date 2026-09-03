import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "../../types";
import { MessageStatus } from "../../types";

// Node has no localStorage — kv-store-backed stores touch it at module load.
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

const {
  mockGetConversation,
  mockGetRecentMessages,
  mockInsertMessage,
  mockUpdateConversation,
  mockClearMessages,
  mockInsertTask,
  mockUpdateTask,
  mockGetTaskById,
  mockNotifyDbChange,
  mockGetModelById,
  mockGetProviderById,
} = vi.hoisted(() => ({
  mockGetConversation: vi.fn(),
  mockGetRecentMessages: vi.fn(),
  mockInsertMessage: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockClearMessages: vi.fn(),
  mockInsertTask: vi.fn(),
  mockUpdateTask: vi.fn(),
  mockGetTaskById: vi.fn(),
  mockNotifyDbChange: vi.fn(),
  mockGetModelById: vi.fn(),
  mockGetProviderById: vi.fn(),
}));

vi.mock("../../storage/database", () => ({
  getConversation: mockGetConversation,
  getRecentMessages: mockGetRecentMessages,
  insertMessage: mockInsertMessage,
  insertMessages: vi.fn(),
  updateConversation: mockUpdateConversation,
  clearMessages: mockClearMessages,
  updateMessage: vi.fn(),
  insertTask: mockInsertTask,
  updateTask: mockUpdateTask,
  getTaskById: mockGetTaskById,
}));

vi.mock("../../hooks/useDatabase", () => ({ notifyDbChange: mockNotifyDbChange }));

vi.mock("../provider-store", () => ({
  useProviderStore: {
    getState: () => ({
      getModelById: mockGetModelById,
      getProviderById: mockGetProviderById,
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

import { buildApiMessagesForParticipant } from "../chat-message-builder";
import { dispatchMessageGeneration } from "../chat-dispatch";
import { clearConversationMessages, promoteMessageToTask } from "../chat-store-actions";

function makeConversation(): Conversation {
  return {
    id: "conversation-1",
    type: "group",
    title: "Discussion",
    participants: [
      { id: "executor-1", modelId: "model-a", identityId: null },
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
    participantId: "executor-1",
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
  text: "📋 request",
  activeBranchId: null,
  getCurrentConversationId: () => "conversation-1",
  abortControllers: new Map<string, AbortController>(),
  participantAbortControllers: new Map<string, AbortController>(),
  streamingMessages: new Map(),
  setStoreState: vi.fn(),
};

describe("discussion tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversation.mockResolvedValue(makeConversation());
    mockGetRecentMessages.mockResolvedValue([
      makeMessage({ id: "m1", content: "earlier message" }),
    ]);
    mockGenerateForParticipant.mockResolvedValue("task output");
    mockUpdateConversation.mockResolvedValue(undefined);
    mockInsertMessage.mockResolvedValue(undefined);
    mockUpdateTask.mockResolvedValue(undefined);
    mockInsertTask.mockResolvedValue(undefined);
    mockClearMessages.mockResolvedValue(undefined);
    mockGetModelById.mockImplementation((id: string) => ({
      id,
      modelId: id,
      displayName: id,
      providerId: "provider-1",
      capabilities: { vision: false, toolCall: false, reasoning: false, streaming: true },
      maxContextLength: 128000,
      enabled: true,
      capabilitiesVerified: true,
      avatar: null,
    }));
    mockGetProviderById.mockImplementation((id: string) => ({
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
    }));
  });

  describe("promoteMessageToTask", () => {
    it("persists a pending task (title + description) and kicks off execution", async () => {
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const taskId = await promoteMessageToTask(
        "conversation-1",
        "source-msg",
        "Fix the bug",
        "Root cause analysis follows",
        "executor-1",
        sendMessage,
      );

      expect(mockInsertTask).toHaveBeenCalledOnce();
      const task = mockInsertTask.mock.calls[0][0];
      expect(task).toMatchObject({
        conversationId: "conversation-1",
        title: "Fix the bug",
        description: "Root cause analysis follows",
        assigneeParticipantId: "executor-1",
        sourceMessageId: "source-msg",
        status: "pending",
        requestMessageId: null,
      });
      expect(task.id).toBe(taskId);

      expect(sendMessage).toHaveBeenCalledWith(
        expect.stringContaining("Fix the bug"),
        undefined,
        { targetParticipantIds: ["executor-1"], taskId },
      );
      expect(mockNotifyDbChange).toHaveBeenCalledWith("tasks", "conversation-1");
    });

    it("clears task state when clearing conversation messages", async () => {
      await clearConversationMessages("conversation-1");

      expect(mockClearMessages).toHaveBeenCalledWith("conversation-1");
      expect(mockUpdateConversation).toHaveBeenCalledWith("conversation-1", {
        lastMessage: null,
        lastMessageAt: null,
      });
      expect(mockNotifyDbChange).toHaveBeenCalledWith("messages", "conversation-1");
      expect(mockNotifyDbChange).toHaveBeenCalledWith("tasks", "conversation-1");
      expect(mockNotifyDbChange).toHaveBeenCalledWith("conversations");
    });
  });

  describe("buildApiMessagesForParticipant", () => {
    it("filters task-request messages out of the execution context", () => {
      const conv = makeConversation();
      const messages = [
        makeMessage({ id: "m1", role: "user", content: "topic", status: MessageStatus.SUCCESS }),
        makeMessage({
          id: "m2",
          role: "user",
          content: "📋 request",
          status: MessageStatus.SUCCESS,
          kind: "task-request",
        }),
      ];
      const apiMessages = buildApiMessagesForParticipant(messages, conv.participants[0], conv);
      const userContents = apiMessages
        .filter((m) => m.role === "user")
        .map((m) => m.content as string);
      expect(userContents).toEqual(["[User said]: topic"]);
    });

    it("injects the task instruction into the assignee system prompt", () => {
      const conv = makeConversation();
      const messages = [makeMessage({ id: "m1", content: "context" })];
      const apiMessages = buildApiMessagesForParticipant(messages, conv.participants[0], conv, {
        systemPromptAppend: "Task: Fix the bug",
      });
      const systemPrompt = apiMessages.find((m) => m.role === "system")?.content as string;
      expect(systemPrompt).toContain("Task: Fix the bug");
    });
  });

  describe("dispatchMessageGeneration (task flow)", () => {
    it("marks the task running, links the request message, and executes once", async () => {
      mockGetTaskById.mockResolvedValue({
        id: "task-1",
        conversationId: "conversation-1",
        title: "Fix the bug",
        description: "",
        assigneeParticipantId: "executor-1",
        status: "pending",
        sourceMessageId: "source-msg",
        requestMessageId: null,
        resultMessageId: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
      });

      await dispatchMessageGeneration({
        ...dispatchArgs,
        options: { targetParticipantIds: ["executor-1"], taskId: "task-1" },
      });

      // Task-request message persisted with kind.
      const inserted = mockInsertMessage.mock.calls.map((c: any[]) => c[0]);
      const requestMsg = inserted.find((m: Message) => m.kind === "task-request");
      expect(requestMsg).toBeDefined();
      expect(requestMsg.role).toBe("user");

      // Task linked + running before generation.
      expect(mockUpdateTask).toHaveBeenCalledWith("task-1", {
        status: "running",
        requestMessageId: requestMsg.id,
      });

      // Exactly one assignee generation — no @ propagation.
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
      const [ctx, participant] = mockGenerateForParticipant.mock.calls[0];
      expect(participant.id).toBe("executor-1");
      expect(ctx.taskId).toBe("task-1");
      expect(ctx.systemPromptAppend).toContain("Fix the bug");
    });

    it("resumes without touching requestMessageId when reusing the request", async () => {
      mockGetTaskById.mockResolvedValue({
        id: "task-1",
        conversationId: "conversation-1",
        title: "Fix the bug",
        description: "",
        assigneeParticipantId: "executor-1",
        status: "paused",
        sourceMessageId: "source-msg",
        requestMessageId: "req-1",
        resultMessageId: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
      });
      mockGetRecentMessages.mockResolvedValue([
        makeMessage({
          id: "req-1",
          role: "user",
          content: "📋 request",
          status: MessageStatus.SUCCESS,
          kind: "task-request",
        }),
      ]);

      await dispatchMessageGeneration({
        ...dispatchArgs,
        options: {
          reuseUserMessageId: "req-1",
          targetParticipantIds: ["executor-1"],
          taskId: "task-1",
        },
      });

      expect(mockInsertMessage).not.toHaveBeenCalled();
      expect(mockUpdateTask).toHaveBeenCalledWith("task-1", { status: "running" });
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
      const [ctx] = mockGenerateForParticipant.mock.calls[0];
      expect(ctx.taskId).toBe("task-1");
    });

    it("does not create a request or start generation when the task no longer exists", async () => {
      mockGetTaskById.mockResolvedValue(null);

      await dispatchMessageGeneration({
        ...dispatchArgs,
        options: { targetParticipantIds: ["executor-1"], taskId: "missing-task" },
      });

      expect(mockInsertMessage).not.toHaveBeenCalled();
      expect(mockUpdateTask).not.toHaveBeenCalled();
      expect(mockGenerateForParticipant).not.toHaveBeenCalled();
    });

    it("marks the task failed before generation when its model is unavailable", async () => {
      mockGetTaskById.mockResolvedValue({
        id: "task-1",
        conversationId: "conversation-1",
        title: "Fix the bug",
        description: "",
        assigneeParticipantId: "executor-1",
        status: "pending",
        sourceMessageId: "source-msg",
        requestMessageId: null,
        resultMessageId: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
      });
      mockGetModelById.mockReturnValue(null);

      await dispatchMessageGeneration({
        ...dispatchArgs,
        options: { targetParticipantIds: ["executor-1"], taskId: "task-1" },
      });

      expect(mockUpdateTask).toHaveBeenCalledWith("task-1", { status: "failed" });
      expect(mockNotifyDbChange).toHaveBeenCalledWith("tasks", "conversation-1");
      expect(mockInsertMessage).not.toHaveBeenCalled();
      expect(mockGenerateForParticipant).not.toHaveBeenCalled();
    });
  });
});
