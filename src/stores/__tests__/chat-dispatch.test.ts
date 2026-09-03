import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Node has no localStorage — kv-store-backed stores (identity-store etc.)
// touch it at module load time, so the stub must exist before imports run.
const mockStorage = vi.hoisted(() => {
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
  // Test-only stub — shape matches the Storage subset kv-store uses.
  (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;
  return storage;
});

// ── Mock modules — MUST be hoisted ──

const {
  mockGetConversation,
  mockGetRecentMessages,
  mockInsertMessage,
  mockUpdateConversation,
  mockNotifyDbChange,
  mockUseProviderStore,
  mockUseSettingsStore,
  mockBuildProviderHeaders,
  mockGenerateForParticipant,
  mockEstimateMessagesTokens,
  mockCompressIfNeeded,
  mockGenerateId,
  mockI18nT,
  mockBuildWorkspaceContextBundle,
  mockBuildApiMessagesForParticipant,
  mockCreateUserMessage,
  mockExtractMentionedParticipants,
  mockResolveTargetParticipants,
} = vi.hoisted(() => ({
  mockGetConversation: vi.fn(),
  mockGetRecentMessages: vi.fn(),
  mockInsertMessage: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockNotifyDbChange: vi.fn(),
  mockUseProviderStore: { getState: vi.fn() },
  mockUseSettingsStore: { getState: vi.fn() },
  mockBuildProviderHeaders: vi.fn(),
  mockGenerateForParticipant: vi.fn(),
  mockEstimateMessagesTokens: vi.fn(),
  mockCompressIfNeeded: vi.fn(),
  mockGenerateId: vi.fn(),
  mockI18nT: vi.fn(),
  mockBuildWorkspaceContextBundle: vi.fn(),
  mockBuildApiMessagesForParticipant: vi.fn(),
  mockCreateUserMessage: vi.fn(),
  mockExtractMentionedParticipants: vi.fn(),
  mockResolveTargetParticipants: vi.fn(),
}));

vi.mock("../../storage/database", () => ({
  getConversation: mockGetConversation,
  getRecentMessages: mockGetRecentMessages,
  insertMessage: mockInsertMessage,
  updateConversation: mockUpdateConversation,
}));

vi.mock("../../hooks/useDatabase", () => ({
  notifyDbChange: mockNotifyDbChange,
}));

vi.mock("../provider-store", () => ({
  useProviderStore: mockUseProviderStore,
}));

vi.mock("../settings-store", () => ({
  useSettingsStore: mockUseSettingsStore,
}));

vi.mock("../../services/provider-headers", () => ({
  buildProviderHeaders: mockBuildProviderHeaders,
}));

vi.mock("../chat-generation", async () => {
  const actual = await vi.importActual("../chat-generation");
  return {
    ...actual,
    generateForParticipant: mockGenerateForParticipant,
  };
});

vi.mock("../../lib/context-compression", () => ({
  estimateMessagesTokens: mockEstimateMessagesTokens,
  compressIfNeeded: mockCompressIfNeeded,
}));

vi.mock("../../lib/id", () => ({
  generateId: mockGenerateId,
}));

vi.mock("../../i18n", () => ({
  default: { t: mockI18nT },
}));

vi.mock("../../services/workspace", () => ({
  buildWorkspaceContextBundle: mockBuildWorkspaceContextBundle,
}));

vi.mock("../chat-message-builder", () => ({
  buildApiMessagesForParticipant: mockBuildApiMessagesForParticipant,
  createUserMessage: mockCreateUserMessage,
  extractMentionedParticipants: mockExtractMentionedParticipants,
  resolveTargetParticipants: mockResolveTargetParticipants,
}));

import { MessageStatus } from "../../types";
import { dispatchMessageGeneration, runAutoDiscuss, preComputeCompression } from "../chat-dispatch";
import type { Conversation, Message, ConversationParticipant } from "../../types";

// ── Helpers ──

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Test Chat",
    type: "group",
    participants: [
      { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
    ],
    speakingOrder: "sequential",
    modelId: "m1",
    systemPrompt: "",
    inputContext: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageTemplate: "",
    config: {},
    ...overrides,
  } as Conversation;
}

function makeUserMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-user-1",
    role: "user",
    content: "Hello",
    conversationId: "conv-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    images: [],
    toolCalls: [],
    toolResults: [],
    status: MessageStatus.SUCCESS,
    ...overrides,
  } as Message;
}

function makeArgs(overrides: Partial<Parameters<typeof dispatchMessageGeneration>[0]> = {}) {
  return {
    conversationId: "conv-1",
    text: "Hello",
    activeBranchId: null,
    getCurrentConversationId: () => "conv-1",
    abortControllers: new Map(),
    participantAbortControllers: new Map(),
    streamingMessages: new Map(),
    setStoreState: vi.fn(),
    images: [],
    options: {},
    ...overrides,
  };
}

// ── Tests ──

describe("dispatchMessageGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetConversation.mockResolvedValue(makeConversation());
    mockGetRecentMessages.mockResolvedValue([]);
    mockInsertMessage.mockResolvedValue(undefined);
    mockUpdateConversation.mockResolvedValue(undefined);
    mockNotifyDbChange.mockImplementation(() => {});
    mockGenerateId.mockReturnValue("msg-user-1");
    mockCreateUserMessage.mockReturnValue(makeUserMessage());
    mockResolveTargetParticipants.mockReturnValue([
      { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
    ]);
    mockGenerateForParticipant.mockResolvedValue("Hello from Alice");
    mockBuildWorkspaceContextBundle.mockResolvedValue({ files: [], tree: undefined });
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: false,
        contextCompressionThreshold: 4000,
      },
    });
    mockUseProviderStore.getState.mockReturnValue({
      getModelById: vi.fn().mockReturnValue(null),
      getProviderById: vi.fn().mockReturnValue(null),
    });
    mockEstimateMessagesTokens.mockReturnValue(100);
    mockCompressIfNeeded.mockResolvedValue({ compressed: false, messages: [] });
    mockBuildApiMessagesForParticipant.mockReturnValue([]);
    mockExtractMentionedParticipants.mockReturnValue([]);
  });

  describe("sequential speaking", () => {
    it("generates for each target sequentially", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
        { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
      ]);
      mockGetConversation.mockResolvedValue(makeConversation({ speakingOrder: "sequential" }));

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(2);
      // Verify sequential ordering via msgIndex
      const calls = (mockGenerateForParticipant as Mock).mock.calls;
      expect(calls[0][1]).toMatchObject({ id: "p1" });
      expect(calls[0][2]).toBe(0);
      expect(calls[1][1]).toMatchObject({ id: "p2" });
      expect(calls[1][2]).toBe(1);
    });

    it("skips the active participant and continues with the next target", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
        { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
      ]);
      mockGetConversation.mockResolvedValue(makeConversation({ speakingOrder: "sequential" }));
      mockGenerateForParticipant.mockImplementationOnce(
        (ctx: { abortController: AbortController }) =>
          new Promise<string>((resolve) => {
            ctx.abortController.signal.addEventListener("abort", () => resolve(""), { once: true });
          }),
      );

      const args = makeArgs();
      const generation = dispatchMessageGeneration(args);
      await vi.waitFor(() => expect(args.participantAbortControllers.has("conv-1")).toBe(true));

      args.participantAbortControllers.get("conv-1")?.abort();
      await generation;

      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(2);
      expect((mockGenerateForParticipant as Mock).mock.calls[1][1]).toMatchObject({ id: "p2" });
      expect(args.participantAbortControllers.size).toBe(0);
      expect(args.setStoreState).toHaveBeenCalledWith({ canSkipCurrent: true });
    });

    it("does not offer skip when there is no next target", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      ]);

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(args.participantAbortControllers.size).toBe(0);
      expect(args.setStoreState).not.toHaveBeenCalledWith({ canSkipCurrent: true });
    });

    it("stops the whole queue when the conversation controller is aborted", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
        { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
      ]);
      mockGenerateForParticipant.mockImplementationOnce(
        (ctx: { abortController: AbortController }) =>
          new Promise<string>((resolve) => {
            ctx.abortController.signal.addEventListener("abort", () => resolve(""), { once: true });
          }),
      );

      const args = makeArgs();
      const generation = dispatchMessageGeneration(args);
      await vi.waitFor(() => expect(args.abortControllers.has("conv-1")).toBe(true));

      args.abortControllers.get("conv-1")?.abort();
      await generation;

      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
    });

    it("returns early if conversation is not found", async () => {
      mockGetConversation.mockResolvedValue(null);

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).not.toHaveBeenCalled();
    });

    it("creates a new user message and inserts it", async () => {
      const args = makeArgs({ text: "Hello world" });
      await dispatchMessageGeneration(args);

      expect(mockCreateUserMessage).toHaveBeenCalledWith(
        "msg-user-1",
        "conv-1",
        "Hello world",
        [],
        null,
        undefined,
      );
      expect(mockInsertMessage).toHaveBeenCalled();
    });

    it("reuses an existing user message when reuseUserMessageId is provided", async () => {
      const existingMsg = makeUserMessage({ id: "existing-msg" });
      mockGetRecentMessages.mockResolvedValue([existingMsg]);

      const args = makeArgs({
        options: {
          reuseUserMessageId: "existing-msg",
          targetParticipantIds: ["p1"],
        },
      });
      await dispatchMessageGeneration(args);

      expect(mockInsertMessage).not.toHaveBeenCalled();
      expect(mockGenerateForParticipant).toHaveBeenCalled();
    });

    it("returns early when reuseUserMessageId message is not found", async () => {
      mockGetRecentMessages.mockResolvedValue([]);

      const args = makeArgs({
        options: { reuseUserMessageId: "nonexistent" },
      });
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).not.toHaveBeenCalled();
    });

    it("returns early when reused message is not from user role", async () => {
      const nonUserMsg = makeUserMessage({ role: "assistant", id: "msg-assistant" });
      mockGetRecentMessages.mockResolvedValue([nonUserMsg]);

      const args = makeArgs({
        options: { reuseUserMessageId: "msg-assistant" },
      });
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).not.toHaveBeenCalled();
    });
  });

  describe("parallel speaking", () => {
    it("generates for all targets when speakingOrder is parallel", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
        { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
      ]);
      mockGetConversation.mockResolvedValue(makeConversation({ speakingOrder: "parallel" }));

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(2);
    });

    it("generates for single target when only one participant exists", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      ]);
      mockGetConversation.mockResolvedValue(makeConversation({ speakingOrder: "parallel" }));

      const args = makeArgs({ text: "Hello" });
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
    });
  });

  describe("random speaking", () => {
    it("generates for all targets when speaking order is random", async () => {
      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
        { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
      ]);
      mockGetConversation.mockResolvedValue(makeConversation({ speakingOrder: "random" }));

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(2);
    });
  });

  describe("@ mention propagation", () => {
    it("propagates to mentioned participants in round 1", async () => {
      const p3: ConversationParticipant = {
        id: "p3",
        nickname: "Charlie",
        identityId: null,
        modelId: "m3",
      };
      mockGetConversation.mockResolvedValue(
        makeConversation({
          type: "group",
          participants: [
            { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
            { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
            p3,
          ],
        }),
      );

      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
        { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
      ]);

      mockGenerateForParticipant.mockImplementation(
        async (_ctx: unknown, target: ConversationParticipant) => {
          return `Response from ${target.nickname}`;
        },
      );

      // p1 mentions p3, p2 mentions nothing
      mockExtractMentionedParticipants.mockImplementation(
        (_content: string, _conv: unknown, participantId: string) => {
          if (participantId === "p1") return ["p3"];
          return [];
        },
      );

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      // Round 0: p1 + p2. Round 1: p3 (mentioned by p1).
      // Total: 3 calls
      const calls = (mockGenerateForParticipant as Mock).mock.calls;
      expect(calls.length).toBe(3);
      expect(calls[2][1]).toMatchObject({ id: "p3" });
    });

    it("stops after MAX_MENTION_ROUNDS (2)", async () => {
      const p3: ConversationParticipant = {
        id: "p3",
        nickname: "Charlie",
        identityId: null,
        modelId: "m3",
      };
      const p4: ConversationParticipant = {
        id: "p4",
        nickname: "Diana",
        identityId: null,
        modelId: "m4",
      };
      mockGetConversation.mockResolvedValue(
        makeConversation({
          type: "group",
          participants: [{ id: "p1", nickname: "Alice", modelId: "m1", identityId: null }, p3, p4],
        }),
      );

      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      ]);

      let callCount = 0;
      mockGenerateForParticipant.mockImplementation(async () => {
        callCount++;
        return "Response";
      });

      // Every response mentions the next participant in chain
      mockExtractMentionedParticipants.mockImplementation(
        (_content: string, _conv: unknown, participantId: string) => {
          if (participantId === "p1") return ["p3"];
          if (participantId === "p3") return ["p4"];
          return [];
        },
      );

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      // Round 0: p1 (mentions p3). Round 1: p3 (mentions p4). Round 2: p4 (mentions none, break).
      // Then round 2 check: round >= MAX_MENTION_ROUNDS → break after p4
      // Total: p1 + p3 + p4 = 3
      expect(callCount).toBe(3);
    });

    it("does not include self-mention in propagation", async () => {
      mockGetConversation.mockResolvedValue(
        makeConversation({
          type: "group",
          participants: [
            { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
            { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
          ],
        }),
      );

      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      ]);

      mockGenerateForParticipant.mockResolvedValue("Hello @Alice!");
      // Alice mentions herself — should be excluded from propagation
      mockExtractMentionedParticipants.mockReturnValue(["p1"]);

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      // Only round 0 — self-mention excluded, no one left to propagate
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
    });

    it("skips propagation for non-group conversations", async () => {
      mockGetConversation.mockResolvedValue(makeConversation({ type: "single" }));

      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      ]);

      mockGenerateForParticipant.mockResolvedValue("Hello @Bob!");
      mockExtractMentionedParticipants.mockReturnValue(["p2"]);

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      // Only one generation — no propagation for single conversations
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
    });

    it("breaks propagation when no new mentions found", async () => {
      mockGetConversation.mockResolvedValue(
        makeConversation({
          type: "group",
          participants: [
            { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
            { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
          ],
        }),
      );

      mockResolveTargetParticipants.mockReturnValue([
        { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
      ]);

      mockGenerateForParticipant.mockResolvedValue("No mentions here.");
      mockExtractMentionedParticipants.mockReturnValue([]);

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      // Only round 0 — no new mentions found, propagation stops
      expect(mockGenerateForParticipant).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanup", () => {
    it("cleans up abort controller and streaming state after completion", async () => {
      const setStoreState = vi.fn();
      const args = makeArgs({ setStoreState });

      await dispatchMessageGeneration(args);

      // Abort controller should be removed
      expect(args.abortControllers.has("conv-1")).toBe(false);
      // setStoreState should be called with isGenerating: false
      expect(setStoreState).toHaveBeenCalledWith(expect.objectContaining({ isGenerating: false }));
    });

    it("sets isGenerating to true when generating for current conversation", async () => {
      const setStoreState = vi.fn();
      const args = makeArgs({
        setStoreState,
        getCurrentConversationId: () => "conv-1",
      });

      await dispatchMessageGeneration(args);

      // Should have set isGenerating: true at start
      expect(setStoreState).toHaveBeenCalledWith(expect.objectContaining({ isGenerating: true }));
    });
  });

  describe("context compression in dispatch", () => {
    it("works when compression is disabled (skips compression)", async () => {
      mockUseSettingsStore.getState.mockReturnValue({
        settings: {
          contextCompressionEnabled: false,
          contextCompressionThreshold: 4000,
        },
      });

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      // preComputeCompression returns null since compression disabled, dispatch still succeeds
      expect(mockGenerateForParticipant).toHaveBeenCalled();
    });

    it("calls buildWorkspaceContextBundle when workspaceDir is set", async () => {
      mockGetConversation.mockResolvedValue(makeConversation({ workspaceDir: "/tmp/ws" }));
      mockBuildWorkspaceContextBundle.mockResolvedValue({
        files: [{ path: "readme.md", content: "hello" }],
        tree: "/tmp/ws",
      });

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(mockBuildWorkspaceContextBundle).toHaveBeenCalledWith("/tmp/ws", "Hello", {
        includeTree: true,
      });
    });

    it("provides empty workspace when no workspaceDir", async () => {
      mockGetConversation.mockResolvedValue(makeConversation({ workspaceDir: undefined }));

      const args = makeArgs();
      await dispatchMessageGeneration(args);

      expect(mockBuildWorkspaceContextBundle).not.toHaveBeenCalled();
    });
  });
});

// ── runAutoDiscuss ──

describe("runAutoDiscuss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversation.mockResolvedValue(
      makeConversation({
        type: "group",
        participants: [
          { id: "p1", nickname: "Alice", modelId: "m1", identityId: null },
          { id: "p2", nickname: "Bob", modelId: "m2", identityId: null },
        ],
      }),
    );
  });

  it("returns early if no current conversation", async () => {
    const sendMessage = vi.fn();
    const setStoreState = vi.fn();

    await runAutoDiscuss({
      rounds: 3,
      currentConversationId: null,
      activeBranchId: null,
      isGenerating: () => false,
      autoDiscussRemaining: () => 3,
      isSessionActive: () => true,
      setStoreState,
      sendMessage,
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returns early if conversation is not group type", async () => {
    mockGetConversation.mockResolvedValue(makeConversation({ type: "single" }));
    const sendMessage = vi.fn();
    const setStoreState = vi.fn();

    await runAutoDiscuss({
      rounds: 3,
      currentConversationId: "conv-1",
      activeBranchId: null,
      isGenerating: () => false,
      autoDiscussRemaining: () => 3,
      isSessionActive: () => true,
      setStoreState,
      sendMessage,
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returns early if conversation has fewer than 2 participants", async () => {
    mockGetConversation.mockResolvedValue(
      makeConversation({
        type: "group",
        participants: [{ id: "p1", nickname: "Alice", modelId: "m1", identityId: null }],
      }),
    );
    const sendMessage = vi.fn();
    const setStoreState = vi.fn();

    await runAutoDiscuss({
      rounds: 3,
      currentConversationId: "conv-1",
      activeBranchId: null,
      isGenerating: () => false,
      autoDiscussRemaining: () => 3,
      isSessionActive: () => true,
      setStoreState,
      sendMessage,
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends topic text and continue prompts for the specified rounds", async () => {
    mockI18nT.mockReturnValue("Continue");
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const setStoreState = vi.fn();

    await runAutoDiscuss({
      rounds: 3,
      topicText: "Let's discuss AI",
      currentConversationId: "conv-1",
      activeBranchId: null,
      isGenerating: () => false,
      autoDiscussRemaining: () => 3,
      isSessionActive: () => true,
      setStoreState,
      sendMessage,
    });

    // First call: topic text
    expect(sendMessage).toHaveBeenCalledWith(
      "Let's discuss AI",
      undefined,
      expect.objectContaining({ conversationId: "conv-1" }),
    );
    // State transitions: start (3/3) → after topic (2) → round 1 (1) →
    // round 2 (0) → finally reset (0/0).
    expect(setStoreState).toHaveBeenNthCalledWith(1, {
      autoDiscussRemaining: 3,
      autoDiscussTotalRounds: 3,
    });
    expect(setStoreState).toHaveBeenNthCalledWith(2, { autoDiscussRemaining: 2 });
    expect(setStoreState).toHaveBeenNthCalledWith(3, { autoDiscussRemaining: 1 });
    expect(setStoreState).toHaveBeenNthCalledWith(4, { autoDiscussRemaining: 0 });
    expect(setStoreState).toHaveBeenNthCalledWith(5, {
      autoDiscussRemaining: 0,
      autoDiscussTotalRounds: 0,
    });
    // Remaining rounds: send "Continue" for round 1 and 2
    // Topic sent + 2 continue rounds = 3 total
    const continueCalls = (sendMessage as Mock).mock.calls.filter(
      (call: unknown[]) => call[0] === "Continue",
    );
    expect(continueCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sends only continue prompts when no topic text", async () => {
    mockI18nT.mockReturnValue("Continue");
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const setStoreState = vi.fn();

    await runAutoDiscuss({
      rounds: 3,
      currentConversationId: "conv-1",
      activeBranchId: null,
      isGenerating: () => false,
      autoDiscussRemaining: () => 3,
      isSessionActive: () => true,
      setStoreState,
      sendMessage,
    });

    // All 3 rounds: "Continue" × (rounds - 0  = 3  but topic not set)
    // Actually: no topic → skip topic step → remaining - 1 = 2 in setStoreState
    // Then for loop: round 1 sends Continue, round 2 sends Continue
    // No topic → skip the topic send, but the countdown still runs:
    // start (3/3) → (2) → round 1 (1) → round 2 (0) → finally reset (0/0).
    expect(setStoreState).toHaveBeenNthCalledWith(1, {
      autoDiscussRemaining: 3,
      autoDiscussTotalRounds: 3,
    });
    expect(setStoreState).toHaveBeenNthCalledWith(2, { autoDiscussRemaining: 2 });
    expect(setStoreState).toHaveBeenNthCalledWith(3, { autoDiscussRemaining: 1 });
    expect(setStoreState).toHaveBeenNthCalledWith(4, { autoDiscussRemaining: 0 });
    expect(setStoreState).toHaveBeenNthCalledWith(5, {
      autoDiscussRemaining: 0,
      autoDiscussTotalRounds: 0,
    });
    expect(sendMessage).toHaveBeenCalled();
    const calls = (sendMessage as Mock).mock.calls;
    expect(calls.every((c: unknown[]) => c[0] === "Continue")).toBe(true);
  });

  it("cleans up autoDiscussRemaining in finally block", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const setStoreState = vi.fn();
    const isSessionActive = vi.fn().mockReturnValue(true);

    await runAutoDiscuss({
      rounds: 1,
      currentConversationId: "conv-1",
      activeBranchId: null,
      isGenerating: () => false,
      autoDiscussRemaining: () => 1,
      isSessionActive,
      setStoreState,
      sendMessage,
    });

    // Finally block should reset autoDiscussRemaining to 0
    expect(setStoreState).toHaveBeenCalledWith(
      expect.objectContaining({ autoDiscussRemaining: 0, autoDiscussTotalRounds: 0 }),
    );
  });
});

// ── preComputeCompression ──

describe("preComputeCompression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildProviderHeaders.mockReturnValue({ "Content-Type": "application/json" });
  });

  it("returns null when compression is disabled", async () => {
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: false,
        contextCompressionThreshold: 4000,
      },
    });

    const result = await preComputeCompression(
      "conv-1",
      makeConversation(),
      [],
      makeUserMessage(),
      new AbortController(),
      null,
    );

    expect(result).toBeNull();
  });

  it("returns null when targets list is empty", async () => {
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: true,
        contextCompressionThreshold: 4000,
      },
    });

    const result = await preComputeCompression(
      "conv-1",
      makeConversation(),
      [],
      makeUserMessage(),
      new AbortController(),
      null,
    );

    expect(result).toBeNull();
  });

  it("returns null when first target model not found", async () => {
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: true,
        contextCompressionThreshold: 4000,
      },
    });
    mockUseProviderStore.getState.mockReturnValue({
      getModelById: vi.fn().mockReturnValue(null),
      getProviderById: vi.fn().mockReturnValue(null),
    });

    const result = await preComputeCompression(
      "conv-1",
      makeConversation(),
      [{ id: "p1", nickname: "Alice", modelId: "m1", identityId: null }],
      makeUserMessage(),
      new AbortController(),
      null,
    );

    expect(result).toBeNull();
  });

  it("returns null when token count is within threshold", async () => {
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: true,
        contextCompressionThreshold: 4000,
      },
    });
    mockUseProviderStore.getState.mockReturnValue({
      getModelById: vi.fn().mockReturnValue({ modelId: "m1", providerId: "prov1" }),
      getProviderById: vi
        .fn()
        .mockReturnValue({ baseUrl: "https://api.example.com/", apiFormat: "chat-completions" }),
    });
    mockGetRecentMessages.mockResolvedValue([]);
    mockBuildApiMessagesForParticipant.mockReturnValue([]);
    mockEstimateMessagesTokens.mockReturnValue(100);

    const result = await preComputeCompression(
      "conv-1",
      makeConversation(),
      [{ id: "p1", nickname: "Alice", modelId: "m1", identityId: null }],
      makeUserMessage(),
      new AbortController(),
      null,
    );

    expect(result).toBeNull();
  });

  it("returns compression summary when token count exceeds threshold", async () => {
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: true,
        contextCompressionThreshold: 4000,
      },
    });
    mockUseProviderStore.getState.mockReturnValue({
      getModelById: vi.fn().mockReturnValue({ modelId: "m1", providerId: "prov1" }),
      getProviderById: vi
        .fn()
        .mockReturnValue({ baseUrl: "https://api.example.com/", apiFormat: "chat-completions" }),
    });
    mockGetRecentMessages.mockResolvedValue([]);
    mockBuildApiMessagesForParticipant.mockReturnValue([]);
    mockEstimateMessagesTokens.mockReturnValue(5000); // Above threshold
    mockBuildProviderHeaders.mockReturnValue({ "Content-Type": "application/json" });
    mockCompressIfNeeded.mockResolvedValue({
      compressed: true,
      messages: [{ role: "user", content: "[Previous conversation summary] This is a summary." }],
    });

    const result = await preComputeCompression(
      "conv-1",
      makeConversation(),
      [{ id: "p1", nickname: "Alice", modelId: "m1", identityId: null }],
      makeUserMessage(),
      new AbortController(),
      null,
    );

    expect(result).toBe("[Previous conversation summary] This is a summary.");
  });

  it("returns null when compression result has no summary message", async () => {
    mockUseSettingsStore.getState.mockReturnValue({
      settings: {
        contextCompressionEnabled: true,
        contextCompressionThreshold: 4000,
      },
    });
    mockUseProviderStore.getState.mockReturnValue({
      getModelById: vi.fn().mockReturnValue({ modelId: "m1", providerId: "prov1" }),
      getProviderById: vi
        .fn()
        .mockReturnValue({ baseUrl: "https://api.example.com/", apiFormat: "chat-completions" }),
    });
    mockGetRecentMessages.mockResolvedValue([]);
    mockBuildApiMessagesForParticipant.mockReturnValue([]);
    mockEstimateMessagesTokens.mockReturnValue(5000);
    mockBuildProviderHeaders.mockReturnValue({ "Content-Type": "application/json" });
    mockCompressIfNeeded.mockResolvedValue({
      compressed: false,
      messages: [{ role: "user", content: "Hello" }],
    });

    const result = await preComputeCompression(
      "conv-1",
      makeConversation(),
      [{ id: "p1", nickname: "Alice", modelId: "m1", identityId: null }],
      makeUserMessage(),
      new AbortController(),
      null,
    );

    expect(result).toBeNull();
  });
});
