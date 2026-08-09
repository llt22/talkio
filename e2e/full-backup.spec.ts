import { expect, test } from "@playwright/test";

test("full backup import warns before replacing chat history", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("talkio:settings", JSON.stringify({ language: "en", theme: "light" }));
  });
  await page.goto("/");
  await page.getByTestId("desktop-nav-settings").click();
  await page.getByRole("button", { name: "Import Backup" }).click();

  await expect(
    page.getByText(/A full backup replaces all chat history on this device/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Import Backup" }).last()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("full backup restores more than 200 messages and message blocks", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const database = await import("/src/storage/database.ts");
    const backupService = await import("/src/services/backup.ts");
    const conversation = {
      id: "backup-conversation",
      type: "single" as const,
      title: "Backup Conversation",
      participants: [],
      lastMessage: "Message 204",
      lastMessageAt: "2026-08-09T03:24:00.000Z",
      pinned: false,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T03:24:00.000Z",
    };
    const messages = Array.from({ length: 205 }, (_, index) => ({
      id: `backup-message-${index}`,
      conversationId: conversation.id,
      role: "assistant" as const,
      senderModelId: null,
      senderName: "Talkio",
      identityId: null,
      participantId: null,
      content: `Message ${index}`,
      images: [],
      generatedImages: [],
      reasoningContent: null,
      reasoningDuration: null,
      toolCalls: [],
      toolResults: [],
      branchId: null,
      parentMessageId: null,
      isStreaming: false,
      status: "success" as const,
      errorMessage: null,
      tokenUsage: null,
      createdAt: new Date(Date.UTC(2026, 7, 9, 0, index)).toISOString(),
    }));

    await database.insertConversation(conversation);
    await database.insertMessages(messages);
    await database.insertBlock({
      id: "backup-block",
      messageId: messages[204].id,
      type: "image",
      content: "data:image/png;base64,AA==",
      status: "success",
      metadata: null,
      sortOrder: 0,
      createdAt: "2026-08-09T03:24:01.000Z",
      updatedAt: null,
    });
    localStorage.setItem(
      "talkio:providers",
      JSON.stringify([{ id: "legacy-provider", apiKey: "sk-must-not-export" }]),
    );

    const backup = await backupService.createBackup();
    await database.replaceChatData({ conversations: [], messages: [], messageBlocks: [] });
    const importResult = await backupService.importBackupFromString(JSON.stringify(backup));

    return {
      version: backup.version,
      exportedMessages: backup.messages.length,
      exportedBlocks: backup.messageBlocks.length,
      containsApiKey: JSON.stringify(backup).includes("sk-must-not-export"),
      importResult,
      restoredConversations: (await database.getAllConversations()).length,
      restoredMessages: (await database.getAllMessages()).length,
      completeExportMessages: (await database.getAllMessagesForConversationBranch(conversation.id))
        .length,
      restoredBlocks: (await database.getAllBlocks()).length,
    };
  });

  expect(result.version).toBe("3.0");
  expect(result.exportedMessages).toBe(205);
  expect(result.exportedBlocks).toBe(1);
  expect(result.containsApiKey).toBe(false);
  expect(result.importResult.success).toBe(true);
  expect(result.restoredConversations).toBe(1);
  expect(result.restoredMessages).toBe(205);
  expect(result.completeExportMessages).toBe(205);
  expect(result.restoredBlocks).toBe(1);
});
