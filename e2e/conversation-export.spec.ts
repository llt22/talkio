import { expect, test } from "@playwright/test";
import sharp from "sharp";

const baseMessage = {
  conversationId: "export-test",
  role: "assistant",
  senderModelId: null,
  senderName: "Talkio",
  identityId: null,
  participantId: null,
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
};

test("long image export produces a non-blank PNG with rendered Markdown", async ({ page }) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");

  await page.evaluate(async (messageDefaults) => {
    const { exportConversationAsImages } = await import("/src/services/export-image.tsx");
    await exportConversationAsImages({
      conversation: {
        id: "export-test",
        type: "single",
        title: "Export Test",
        participants: [],
        lastMessage: null,
        lastMessageAt: null,
        pinned: false,
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      },
      messages: [
        {
          ...messageDefaults,
          id: "message-1",
          content: "# Rendered heading\n\n```ts\nconst answer = 42;\n```",
          images: [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xb7xAAAAAElFTkSuQmCC",
          ],
          reasoningContent: "Checked the result.",
          createdAt: "2026-08-09T00:01:00.000Z",
        },
      ],
      titleFallback: "Conversation",
      youLabel: "You",
      thoughtProcessLabel: "Thought process",
    });
  }, baseMessage);

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Export_Test.png");
  const path = await download.path();
  expect(path).not.toBeNull();
  const image = sharp(path!);
  const metadata = await image.metadata();
  const stats = await image.stats();
  expect(metadata.width).toBe(1350);
  expect(metadata.height).toBeGreaterThan(200);
  expect(stats.channels.some((channel) => channel.min < channel.max)).toBe(true);
});

test("very long conversations are exported as numbered PNG slices", async ({ page }) => {
  await page.goto("/");
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));

  const pageCount = await page.evaluate(async (messageDefaults) => {
    const { exportConversationAsImages } = await import("/src/services/export-image.tsx");
    return await exportConversationAsImages({
      conversation: {
        id: "export-test",
        type: "single",
        title: "Long Export",
        participants: [],
        lastMessage: null,
        lastMessageAt: null,
        pinned: false,
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      },
      messages: Array.from({ length: 150 }, (_, index) => ({
        ...messageDefaults,
        id: `message-${index}`,
        content: `Message ${index}: complete conversation export content.`,
        createdAt: new Date(Date.UTC(2026, 7, 9, 0, index)).toISOString(),
      })),
      titleFallback: "Conversation",
      youLabel: "You",
      thoughtProcessLabel: "Thought process",
    });
  }, baseMessage);

  expect(pageCount).toBeGreaterThan(1);
  await expect.poll(() => downloads.length).toBe(pageCount);
  expect(downloads[0]).toBe("Long_Export-01.png");
  expect(downloads.at(-1)).toBe(`Long_Export-${String(pageCount).padStart(2, "0")}.png`);
});
