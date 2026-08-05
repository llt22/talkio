import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mocks must be hoisted before imports ──

const {
  mockUpdateMessage,
  mockNotifyDbChange,
  mockExecuteBuiltInTool,
  mockGetBuiltInToolDefs,
  mockExecuteMcpToolByName,
  mockCreateStreamFlusher,
  mockUseSettingsStore,
} = vi.hoisted(() => ({
  mockUpdateMessage: vi.fn(),
  mockNotifyDbChange: vi.fn(),
  mockExecuteBuiltInTool: vi.fn(),
  mockGetBuiltInToolDefs: vi.fn(),
  mockExecuteMcpToolByName: vi.fn(),
  mockCreateStreamFlusher: vi.fn(),
  mockUseSettingsStore: {
    getState: vi.fn(() => ({ settings: { toolApprovalMode: "auto" as const } })),
  },
}));

vi.mock("../settings-store", () => ({
  useSettingsStore: mockUseSettingsStore,
}));

vi.mock("../../storage/database", () => ({
  updateMessage: mockUpdateMessage,
}));

vi.mock("../../hooks/useDatabase", () => ({
  notifyDbChange: mockNotifyDbChange,
}));

vi.mock("../../services/built-in-tools", () => ({
  executeBuiltInTool: mockExecuteBuiltInTool,
  getBuiltInToolDefs: mockGetBuiltInToolDefs,
}));

vi.mock("../../services/mcp", () => ({
  executeMcpToolByName: mockExecuteMcpToolByName,
}));

vi.mock("../generation-helpers", async () => {
  const actual = await vi.importActual("../generation-helpers");
  return {
    ...actual,
    createStreamFlusher: mockCreateStreamFlusher,
  };
});

import { runToolCallLoop } from "../tool-call-loop";
import { toolApproval } from "../../services/tool-approval";
import { MessageStatus } from "../../types";
import type { GenerationContext } from "../chat-generation";
import type { ProviderAdapter, StreamChatResult } from "../../services/provider-adapters";

// ── Helpers ──

function makeGenerationContext(overrides: Partial<GenerationContext> = {}): GenerationContext {
  return {
    cid: "conv-1",
    conversation: {
      id: "conv-1",
      title: "Test",
      type: "group",
      participants: [],
      speakingOrder: "sequential",
      modelId: "m1",
      providerId: "p1",
      systemPrompt: "",
      inputContext: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageTemplate: "",
      config: {},
    } as unknown as GenerationContext["conversation"],
    userMsg: {
      id: "msg-user",
      role: "user",
      content: "Hello",
      conversationId: "conv-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [],
      toolCalls: [],
      toolResults: [],
      status: 0,
    } as unknown as GenerationContext["userMsg"],
    activeBranchId: null,
    abortController: new AbortController(),
    cachedCompressionSummary: null,
    compressionEnabled: false,
    compressionThreshold: 4000,
    streamingMessages: new Map(),
    getCurrentConversationId: () => "conv-1",
    setStoreState: vi.fn(),
    ...overrides,
  };
}

function makeMockAdapter(streamResult: Partial<StreamChatResult> = {}): ProviderAdapter {
  return {
    streamChat: vi.fn().mockResolvedValue({
      usage: null,
      ...streamResult,
    }),
    chat: vi.fn().mockResolvedValue(""),
    probeCapabilities: vi
      .fn()
      .mockResolvedValue({ vision: true, toolCall: true, reasoning: false, streaming: true }),
  };
}

function makeContentAccumulator(
  overrides: Partial<{
    fullContent: string;
    fullReasoning: string;
    inThinkTag: boolean;
    pendingToolCalls: Array<{ id: string; name: string; arguments: string }>;
  }> = {},
) {
  return {
    fullContent: "",
    fullReasoning: "",
    inThinkTag: false,
    pendingToolCalls: [],
    ...overrides,
  };
}

// ── Tests ──

describe("runToolCallLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateStreamFlusher.mockReturnValue({ flush: vi.fn(), schedule: vi.fn() });
    // clearAllMocks keeps mockReturnValue — reset the approval mode explicitly.
    (mockUseSettingsStore.getState as Mock).mockReturnValue({
      settings: { toolApprovalMode: "auto" as const },
    });
    mockGetBuiltInToolDefs.mockReturnValue(
      [
        "get_weather",
        "remote_search",
        "failing_tool",
        "remote_fail",
        "step1",
        "step2",
        "init",
        "loop_tool",
        "t1",
        "t2",
        "test_tool",
      ].map((name) => ({ name, description: `${name} description` })),
    );
  });

  describe("no tool calls — immediate return", () => {
    it("returns accumulated content when initial response has no tool calls", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "Hello, I can help!",
        pendingToolCalls: [],
      });
      const adapter = makeMockAdapter();

      const result = await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      expect(result.content).toBe("Hello, I can help!");
      expect(adapter.streamChat).not.toHaveBeenCalled();
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          content: "Hello, I can help!",
          isStreaming: false,
          status: MessageStatus.SUCCESS,
        }),
      );
    });

    it("returns empty content when accumulator has no content and no tool calls", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({ fullContent: "", pendingToolCalls: [] });
      const adapter = makeMockAdapter();

      const result = await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      expect(result.content).toBe("");
    });
  });

  describe("tool execution — single round", () => {
    it("skips tool execution when the user rejects approval", async () => {
      (mockUseSettingsStore.getState as Mock).mockReturnValue({
        settings: { toolApprovalMode: "ask" },
      });
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "get_weather", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();
      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "should not run" });

      const runPromise = runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // Approval request parks; simulate the user rejecting it.
      await vi.waitFor(() => expect(toolApproval.getPending().length).toBe(1));
      toolApproval.resolve(toolApproval.getPending()[0].id, false);
      await runPromise;

      expect(mockExecuteBuiltInTool).not.toHaveBeenCalled();
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolResults: [{ toolCallId: "tc-1", content: "Tool call rejected by user: get_weather" }],
        }),
      );
    });
    it("executes a built-in tool call and saves results", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "Let me check the weather.",
        pendingToolCalls: [{ id: "tc-1", name: "get_weather", arguments: '{"city":"NYC"}' }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "Sunny, 25°C" });

      const result = await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        { get_weather: true },
        null,
        undefined,
        null,
        undefined,
      );

      expect(mockExecuteBuiltInTool).toHaveBeenCalledWith(
        "get_weather",
        { city: "NYC" },
        undefined,
      );
      expect(result.content).toBe("Let me check the weather.");
    });

    it("executes an MCP tool when built-in tool returns null", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "remote_search", arguments: '{"query":"test"}' }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue(null);
      mockExecuteMcpToolByName.mockResolvedValue({ success: true, content: "Found 3 results" });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      expect(mockExecuteMcpToolByName).toHaveBeenCalledWith(
        "remote_search",
        { query: "test" },
        undefined,
      );
    });

    it("returns tool-not-found content when no tool matches", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "unknown_tool", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue(null);
      mockExecuteMcpToolByName.mockResolvedValue(null);

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // Verify tool results contain the "not found" message
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolResults: expect.arrayContaining([
            expect.objectContaining({ content: "Tool not found: unknown_tool" }),
          ]),
        }),
      );
    });

    it("handles built-in tool error and returns error content", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "failing_tool", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: false, error: "Permission denied" });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        { failing_tool: true },
        null,
        undefined,
        null,
        undefined,
      );

      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolResults: expect.arrayContaining([
            expect.objectContaining({ content: "Error: Permission denied" }),
          ]),
        }),
      );
    });

    it("handles MCP tool execution error gracefully", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "remote_fail", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue(null);
      mockExecuteMcpToolByName.mockRejectedValue(new Error("Network timeout"));

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolResults: expect.arrayContaining([
            expect.objectContaining({ content: "Error: Network timeout" }),
          ]),
        }),
      );
    });
  });

  describe("multi-round tool loop", () => {
    it("continues to next round when follow-up has new tool calls", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "Let me check.",
        pendingToolCalls: [{ id: "tc-1", name: "step1", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool
        .mockResolvedValueOnce({ success: true, content: "Step 1 done" })
        .mockResolvedValueOnce({ success: true, content: "Step 2 done" });

      // First streamChat call returns new tool calls for the next round
      let callCount = 0;
      (adapter.streamChat as Mock).mockImplementation(
        async (params: { onDelta: (delta: Record<string, unknown>) => void }) => {
          callCount++;
          if (callCount === 1) {
            // Emit a delta with a new tool call
            params.onDelta({
              tool_calls: [
                {
                  index: 0,
                  id: "tc-2",
                  function: { name: "step2", arguments: "{}" },
                },
              ],
            });
            return { usage: null };
          }
          return { usage: null };
        },
      );

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // streamChat: once for the initial follow-up (returns tc-2), once more
      // for the follow-up after tc-2 (no new tool calls → loop ends).
      expect(adapter.streamChat).toHaveBeenCalledTimes(2);
      // step2 should have been executed
      expect(mockExecuteBuiltInTool).toHaveBeenCalledTimes(2);
    });

    it("stops after max 5 rounds even if tool calls persist", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-init", name: "init", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "done" });

      // Every streamChat call returns a new tool call to force another round
      (adapter.streamChat as Mock).mockImplementation(
        async (params: { onDelta: (delta: Record<string, unknown>) => void }) => {
          params.onDelta({
            tool_calls: [
              {
                index: 0,
                id: "tc-next",
                function: { name: "loop_tool", arguments: "{}" },
              },
            ],
          });
          return { usage: null };
        },
      );

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // The loop has MAX_TOOL_ROUNDS = 5 iterations. streamChat is called on each.
      // 5 follow-up rounds (streamChat calls) + initial tool execution
      expect(adapter.streamChat).toHaveBeenCalledTimes(5);
    });

    it("breaks early when follow-up has no new tool calls", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "Let me check.",
        pendingToolCalls: [{ id: "tc-1", name: "step1", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValueOnce({ success: true, content: "Done" });

      // streamChat returns no tool_calls in delta → break
      (adapter.streamChat as Mock).mockResolvedValue({ usage: null });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // Only one round: initial tool executed, then streamChat called once, then breaks
      expect(adapter.streamChat).toHaveBeenCalledTimes(1);
    });

    it("saves accumulated tool calls and results across rounds", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "t1", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool
        .mockResolvedValueOnce({ success: true, content: "r1" })
        .mockResolvedValueOnce({ success: true, content: "r2" });

      let callCount = 0;
      (adapter.streamChat as Mock).mockImplementation(
        async (params: { onDelta: (delta: Record<string, unknown>) => void }) => {
          callCount++;
          if (callCount === 1) {
            params.onDelta({
              tool_calls: [
                {
                  index: 0,
                  id: "tc-2",
                  function: { name: "t2", arguments: "{}" },
                },
              ],
            });
          }
          return { usage: null };
        },
      );

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // Verify final updateMessage call includes the final content and SUCCESS status
      const finalCall = mockUpdateMessage.mock.calls.find(
        (call: unknown[]) => (call[1] as Record<string, unknown>).status === MessageStatus.SUCCESS,
      );
      expect(finalCall).toBeDefined();
      expect(finalCall![0]).toBe("msg-1");
      expect(finalCall![1]).toMatchObject({
        isStreaming: false,
        status: MessageStatus.SUCCESS,
      });
    });

    it("sends each tool turn once and accumulates records and usage", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        pendingToolCalls: [{ id: "tc-1", name: "t1", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();
      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "ok" });

      let callCount = 0;
      (adapter.streamChat as Mock).mockImplementation(
        async (params: {
          messages: Array<{ role: string; tool_calls?: Array<{ id: string }> }>;
          onDelta: (delta: Record<string, unknown>) => void;
        }) => {
          callCount++;
          if (callCount < 3) {
            params.onDelta({
              tool_calls: [
                {
                  index: 0,
                  id: `tc-${callCount + 1}`,
                  function: { name: `t${callCount + 1}`, arguments: "{}" },
                },
              ],
            });
          }
          const ids = params.messages.flatMap((message) =>
            (message.tool_calls ?? []).map((toolCall) => toolCall.id),
          );
          expect(new Set(ids).size).toBe(ids.length);
          return {
            usage: { prompt_tokens: callCount * 10, completion_tokens: callCount },
          };
        },
      );

      const result = await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        { inputTokens: 5, outputTokens: 2 },
        undefined,
      );

      expect(result.tokenUsage).toEqual({ inputTokens: 65, outputTokens: 8 });
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolCalls: [
            expect.objectContaining({ id: "tc-1" }),
            expect.objectContaining({ id: "tc-2" }),
            expect.objectContaining({ id: "tc-3" }),
          ],
        }),
      );
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolResults: [
            expect.objectContaining({ toolCallId: "tc-1" }),
            expect.objectContaining({ toolCallId: "tc-2" }),
            expect.objectContaining({ toolCallId: "tc-3" }),
          ],
        }),
      );
    });
  });

  describe("parseToolArgs via tool execution", () => {
    it("parses valid JSON arguments", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [
          { id: "tc-1", name: "test_tool", arguments: '{"key":"value","num":42}' },
        ],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "ok" });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        { test_tool: true },
        null,
        undefined,
        null,
        undefined,
      );

      expect(mockExecuteBuiltInTool).toHaveBeenCalledWith(
        "test_tool",
        { key: "value", num: 42 },
        undefined,
      );
    });

    it("falls back to empty object for invalid JSON arguments", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "test_tool", arguments: "not-json" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "ok" });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        { test_tool: true },
        null,
        undefined,
        null,
        undefined,
      );

      expect(mockExecuteBuiltInTool).toHaveBeenCalledWith("test_tool", {}, undefined);
    });
  });

  describe("token usage tracking", () => {
    it("returns null token usage when adapter returns null usage", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({ fullContent: "ok", pendingToolCalls: [] });
      const adapter = makeMockAdapter();

      const result = await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      expect(result.tokenUsage).toBeNull();
    });

    it("tracks token usage from SSE stream", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "t1", arguments: "{}" }],
      });
      const adapter = makeMockAdapter({
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "done" });

      const result = await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      expect(result.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
      });
    });
  });

  describe("database interaction", () => {
    it("saves initial tool calls and results to database", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "Let me check.",
        pendingToolCalls: [{ id: "tc-1", name: "test_tool", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "result" });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // First updateMessage: save content + tool calls
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          content: "Let me check.",
          toolCalls: [{ id: "tc-1", name: "test_tool", arguments: "{}" }],
        }),
      );

      // Second updateMessage: save tool results
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        "msg-1",
        expect.objectContaining({
          toolResults: [{ toolCallId: "tc-1", content: "result" }],
        }),
      );
    });

    it("notifies database change after each update", async () => {
      const ctx = makeGenerationContext();
      const acc = makeContentAccumulator({
        fullContent: "",
        pendingToolCalls: [{ id: "tc-1", name: "test_tool", arguments: "{}" }],
      });
      const adapter = makeMockAdapter();

      mockExecuteBuiltInTool.mockResolvedValue({ success: true, content: "done" });

      await runToolCallLoop(
        ctx,
        "msg-1",
        acc,
        "",
        [],
        adapter,
        "https://api.example.com",
        {},
        "gpt-4",
        null,
        undefined,
        [],
        {},
        null,
        undefined,
        null,
        undefined,
      );

      // notifyDbChange should be called multiple times (initial save, result save, final save)
      expect(mockNotifyDbChange).toHaveBeenCalledWith("messages", "conv-1");
    });
  });
});
