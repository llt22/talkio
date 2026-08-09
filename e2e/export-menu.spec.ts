import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("talkio:settings", JSON.stringify({ language: "en", theme: "light" }));
  });
});

async function seedConversation(page: Page) {
  await page.evaluate(async () => {
    const database = await import("/src/storage/database.ts");
    const { notifyDbChange } = await import("/src/hooks/useDatabase.ts");
    await database.insertConversation({
      id: "export-ui-test",
      type: "single",
      title: "Export UI Test",
      participants: [],
      lastMessage: "Ready to export",
      lastMessageAt: "2026-08-09T00:01:00.000Z",
      pinned: false,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:01:00.000Z",
    });
    await database.insertMessage({
      id: "export-ui-message",
      conversationId: "export-ui-test",
      role: "assistant",
      senderModelId: null,
      senderName: "Talkio",
      identityId: null,
      participantId: null,
      content: "Ready to export",
      images: [],
      generatedImages: [],
      reasoningContent: null,
      reasoningDuration: null,
      toolCalls: [],
      toolResults: [],
      branchId: null,
      parentMessageId: null,
      isStreaming: false,
      status: "success",
      errorMessage: null,
      tokenUsage: null,
      createdAt: "2026-08-09T00:01:00.000Z",
    });
    notifyDbChange("all");
  });
}

test("desktop chat menu exposes long image export", async ({ page }) => {
  await page.goto("/");
  await seedConversation(page);
  await page.getByText("Export UI Test", { exact: true }).click();
  await page.getByTestId("chat-more-menu").click();
  await expect(page.getByRole("menuitem", { name: "Export Long Image" })).toBeVisible();
});

test("mobile chat menu exposes long image export without overlap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await seedConversation(page);
  await page.getByText("Export UI Test", { exact: true }).click();
  await page.getByTestId("chat-more-menu").click();
  const exportButton = page.getByRole("button", { name: "Export Long Image" });
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeInViewport();
});
