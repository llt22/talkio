import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../../types";

const { appFetch } = vi.hoisted(() => ({ appFetch: vi.fn() }));
vi.mock("../../lib/http", () => ({ appFetch }));

import { fetchProviderModels } from "../provider-service";

const provider: Provider = {
  id: "provider-1",
  name: "Poe",
  type: "openai",
  apiFormat: "chat-completions",
  baseUrl: "https://api.poe.com/v1",
  apiKey: "test-key",
  customHeaders: [],
  enabled: true,
  status: "connected",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("fetchProviderModels", () => {
  it("accepts models whose context_length is null", async () => {
    appFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: "with-context", object: "model", context_length: 200000 },
            { id: "without-context", object: "model", context_length: null },
          ],
        }),
      ),
    );

    await expect(fetchProviderModels(provider)).resolves.toEqual([
      { id: "with-context", object: "model", context_length: 200000 },
      { id: "without-context", object: "model", context_length: undefined },
    ]);
  });
});
