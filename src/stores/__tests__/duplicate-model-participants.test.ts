import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../../types";

const { mockGetConversation, mockUpdateConversation, mockNotifyDbChange } = vi.hoisted(() => ({
  mockGetConversation: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockNotifyDbChange: vi.fn(),
}));

vi.mock("../../storage/database", () => ({
  clearMessages: vi.fn(),
  deleteMessage: vi.fn(),
  getConversation: mockGetConversation,
  getRecentMessages: vi.fn(),
  insertMessages: vi.fn(),
  insertConversation: vi.fn(),
  updateConversation: mockUpdateConversation,
  updateMessage: vi.fn(),
}));

vi.mock("../../hooks/useDatabase", () => ({ notifyDbChange: mockNotifyDbChange }));

vi.mock("../provider-store", () => ({
  useProviderStore: {
    getState: () => ({
      getModelById: (id: string) => ({ id, displayName: id }),
    }),
  },
}));

import { addParticipant, addParticipants } from "../chat-store-actions";

function makeConversation(): Conversation {
  return {
    id: "conversation-1",
    type: "group",
    title: "Custom group",
    participants: [{ id: "participant-1", modelId: "model-a", identityId: "persona-1" }],
    lastMessage: null,
    lastMessageAt: null,
    pinned: false,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

describe("group participants with duplicate models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversation.mockResolvedValue(makeConversation());
    mockUpdateConversation.mockResolvedValue(undefined);
  });

  it("adds another participant using an existing model", async () => {
    await addParticipant("conversation-1", "model-a", "persona-2");

    expect(mockUpdateConversation).toHaveBeenCalledOnce();
    const updates = mockUpdateConversation.mock.calls[0][1];
    expect(updates.participants).toEqual([
      { id: "participant-1", modelId: "model-a", identityId: "persona-1" },
      expect.objectContaining({ modelId: "model-a", identityId: "persona-2" }),
    ]);
  });

  it("preserves every selected persona when batch members share a model", async () => {
    await addParticipants("conversation-1", [
      { modelId: "model-a", identityId: "persona-2" },
      { modelId: "model-a", identityId: "persona-3" },
    ]);

    const updates = mockUpdateConversation.mock.calls[0][1];
    expect(updates.participants).toHaveLength(3);
    expect(updates.participants.slice(1)).toEqual([
      expect.objectContaining({ modelId: "model-a", identityId: "persona-2" }),
      expect.objectContaining({ modelId: "model-a", identityId: "persona-3" }),
    ]);
  });
});
