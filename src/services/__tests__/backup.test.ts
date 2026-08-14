import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  getAllConversations: vi.fn(),
  getAllMessages: vi.fn(),
  getAllBlocks: vi.fn(),
  getAllTasks: vi.fn(),
  replaceChatData: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  getObject: vi.fn(),
  setObject: vi.fn(),
  getString: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../storage/database", () => database);
vi.mock("../../storage/kv-store", () => ({ kvStore: storage }));
vi.mock("../secret-store", () => ({ secretStore: { set: vi.fn() } }));
vi.mock("../file-download", () => ({ saveOrShareFile: vi.fn() }));

import { createBackup, importBackupFromString } from "../backup";

const validConversation = {
  id: "conversation-1",
  type: "single",
  title: "Conversation",
  participants: [],
  pinned: false,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};
const validMessage = {
  id: "message-1",
  conversationId: "conversation-1",
  role: "assistant",
  content: "Hello",
  images: [],
  generatedImages: [],
  toolCalls: [],
  toolResults: [],
  isStreaming: false,
  status: "success",
  createdAt: "2026-08-09T00:01:00.000Z",
};

describe("full backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getObject.mockReturnValue(undefined);
    storage.getString.mockReturnValue(null);
    database.getAllConversations.mockResolvedValue([{ id: "conversation-1" }]);
    database.getAllMessages.mockResolvedValue([{ id: "message-1" }]);
    database.getAllBlocks.mockResolvedValue([{ id: "block-1" }]);
    database.getAllTasks.mockResolvedValue([{ id: "task-1" }]);
  });

  it("exports chat data in the 3.0 format", async () => {
    const backup = await createBackup();

    expect(backup.version).toBe("3.0");
    expect(backup.conversations).toEqual([{ id: "conversation-1" }]);
    expect(backup.messages).toEqual([{ id: "message-1" }]);
    expect(backup.messageBlocks).toEqual([{ id: "block-1" }]);
    expect(backup.tasks).toEqual([{ id: "task-1" }]);
  });

  it("never includes legacy plaintext provider keys", async () => {
    storage.getObject.mockImplementation((key: string) =>
      key === "providers"
        ? [{ id: "provider-1", apiKey: "sk-legacy" }]
        : key === "settings"
          ? { language: "en", sttApiKey: "stt-legacy" }
          : undefined,
    );

    const backup = await createBackup();

    expect(backup.providers).toEqual([{ id: "provider-1" }]);
    expect(JSON.stringify(backup)).not.toContain("sk-legacy");
    expect(JSON.stringify(backup)).not.toContain("stt-legacy");
  });

  it("restores chat data from a 3.0 backup", async () => {
    const validTask = {
      id: "task-1",
      conversationId: "conversation-1",
      title: "Fix the bug",
      description: "",
      assigneeParticipantId: null,
      status: "done",
      sourceMessageId: "message-1",
      requestMessageId: null,
      resultMessageId: null,
      createdAt: "2026-08-09T00:02:00.000Z",
      updatedAt: "2026-08-09T00:03:00.000Z",
    };
    const result = await importBackupFromString(
      JSON.stringify({
        version: "3.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        providers: [],
        models: [],
        identities: [],
        mcpServers: [],
        conversations: [validConversation],
        messages: [validMessage],
        messageBlocks: [],
        tasks: [validTask],
      }),
    );

    expect(result.success).toBe(true);
    expect(database.replaceChatData).toHaveBeenCalledOnce();
    expect(database.replaceChatData).toHaveBeenCalledWith({
      conversations: [validConversation],
      messages: [validMessage],
      messageBlocks: [],
      tasks: [validTask],
    });
    expect(result.counts?.conversations).toBe(1);
    expect(result.counts?.messages).toBe(1);
    expect(result.counts?.tasks).toBe(1);
  });

  it("imports 3.0 backups exported before the tasks table existed", async () => {
    const result = await importBackupFromString(
      JSON.stringify({
        version: "3.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        providers: [],
        models: [],
        identities: [],
        mcpServers: [],
        conversations: [validConversation],
        messages: [validMessage],
        messageBlocks: [],
      }),
    );

    expect(result.success).toBe(true);
    expect(database.replaceChatData).toHaveBeenCalledWith({
      conversations: [validConversation],
      messages: [validMessage],
      messageBlocks: [],
      tasks: [],
    });
  });

  it("keeps accepting 2.0 configuration backups without replacing chats", async () => {
    const result = await importBackupFromString(
      JSON.stringify({
        version: "2.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        providers: [],
        models: [],
        identities: [],
        mcpServers: [],
      }),
    );

    expect(result.success).toBe(true);
    expect(database.replaceChatData).not.toHaveBeenCalled();
  });

  it("rejects malformed configuration before replacing chats", async () => {
    const result = await importBackupFromString(
      JSON.stringify({
        version: "3.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        providers: {},
        models: [],
        identities: [],
        mcpServers: [],
        conversations: [],
        messages: [],
        messageBlocks: [],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PARSE_ERROR");
    expect(database.replaceChatData).not.toHaveBeenCalled();
  });

  it("rejects malformed chat records before changing configuration", async () => {
    const result = await importBackupFromString(
      JSON.stringify({
        version: "3.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        providers: [],
        models: [],
        identities: [],
        mcpServers: [],
        conversations: [validConversation],
        messages: [{ id: "message-1", conversationId: "conversation-1" }],
        messageBlocks: [],
      }),
    );

    expect(result.success).toBe(false);
    expect(storage.setObject).not.toHaveBeenCalled();
    expect(database.replaceChatData).not.toHaveBeenCalled();
  });

  it("restores the previous configuration when chat replacement fails", async () => {
    storage.getString.mockImplementation((key: string) => `old-${key}`);
    database.replaceChatData.mockRejectedValueOnce(new Error("restore failed"));

    const result = await importBackupFromString(
      JSON.stringify({
        version: "3.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        providers: [],
        models: [],
        identities: [],
        mcpServers: [],
        conversations: [],
        messages: [],
        messageBlocks: [],
      }),
    );

    expect(result.success).toBe(false);
    expect(storage.set).toHaveBeenCalledWith("providers", "old-providers");
    expect(storage.set).toHaveBeenCalledWith("settings", "old-settings");
  });
});
