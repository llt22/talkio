import { expect, test } from "@playwright/test";

test("provider to chat flow preserves model state and classifies authentication errors", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("https://mock.talkio.test/v1/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: "talkio-e2e-model", object: "model" }] }),
    });
  });
  await page.route("https://mock.talkio.test/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Invalid API key" } }),
    });
  });

  await page.goto("/");
  await page.getByTestId("desktop-nav-settings").click();
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByTestId("add-provider").click();

  await page.getByLabel("Name").fill("Talkio E2E Provider");
  await page.getByLabel("Base URL").fill("https://mock.talkio.test/v1");
  await page.getByLabel("API Key").fill("not-a-real-secret");
  await page.getByRole("button", { name: "Connect & Fetch Models" }).click();
  const modelToggle = page.getByLabel("talkio-e2e-model Enabled");
  await expect(modelToggle).toBeChecked();
  await modelToggle.uncheck({ force: true });
  await expect(modelToggle).not.toBeChecked();
  await modelToggle.check({ force: true });
  await expect(modelToggle).toBeChecked();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const providersBlob = await page.evaluate(() => localStorage.getItem("talkio:providers"));
  expect(providersBlob).toContain("Talkio E2E Provider");
  expect(providersBlob).not.toContain("not-a-real-secret");

  await page.getByTestId("desktop-nav-experts").click();
  await page.getByRole("button", { name: /talkio-e2e-model/ }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await page.getByTestId("chat-input").fill("Trigger an authentication failure");
  await page.getByTestId("chat-input").press("Enter");

  await expect(
    page.getByText("Authentication failed. Check the provider API key and access permissions."),
  ).toBeVisible();
  await expect(page.getByText(/API Error 401/)).toBeVisible();
});

test("clearing history aborts an active generation and removes its placeholder", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("https://mock.talkio.test/v1/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: "talkio-e2e-model", object: "model" }] }),
    });
  });
  const pendingResponse = Promise.withResolvers<void>();
  await page.route("https://mock.talkio.test/v1/chat/completions", async (route) => {
    await pendingResponse.promise;
    await route.abort();
  });

  await page.goto("/");
  await page.getByTestId("desktop-nav-settings").click();
  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByTestId("add-provider").click();
  await page.getByLabel("Name").fill("Talkio Clear History Provider");
  await page.getByLabel("Base URL").fill("https://mock.talkio.test/v1");
  await page.getByLabel("API Key").fill("test-key");
  await page.getByRole("button", { name: "Connect & Fetch Models" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByTestId("desktop-nav-experts").click();
  await page.getByRole("button", { name: /talkio-e2e-model/ }).click();
  await page.getByTestId("chat-input").fill("Keep generating");
  await page.getByTestId("chat-input").press("Enter");
  await expect(page.getByTestId("chat-input")).toBeDisabled();

  await page.getByTestId("chat-more-menu").click();
  await page.getByRole("menuitem", { name: "Clear History" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByText("Keep generating")).toHaveCount(0);
  await expect(page.getByTestId("chat-input")).toBeEnabled();
  pendingResponse.resolve();
});
