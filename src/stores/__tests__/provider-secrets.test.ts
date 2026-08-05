import { describe, it, expect, beforeEach, vi } from "vitest";

// Node has no localStorage — install a memory stub before any module loads.
vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;
});

// Node environment: platform.ts resolves isDesktop=false → secret-store uses
// the localStorage fallback, which is exactly what we want to exercise here.

function resetStorage() {
  localStorage.clear();
  vi.resetModules();
}

async function loadStore() {
  const { useProviderStore } = await import("../provider-store");
  return useProviderStore;
}

describe("provider secret persistence", () => {
  beforeEach(() => {
    resetStorage();
  });

  it("never persists apiKey in the providers blob", async () => {
    const store = await loadStore();
    store.getState().addProvider({
      id: "p1",
      name: "OpenAI",
      type: "openai",
      apiFormat: "chat-completions",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-secret-123",
      customHeaders: [],
      enabled: true,
      status: "connected",
      createdAt: new Date().toISOString(),
    });

    const stored = JSON.parse(localStorage.getItem("talkio:providers") ?? "[]");
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0].apiKey).toBeUndefined();
    expect(stored[0].id).toBe("p1");
  });

  it("stores the secret under talkio:secret:<providerId>", async () => {
    const store = await loadStore();
    store.getState().addProvider({
      id: "p1",
      name: "OpenAI",
      type: "openai",
      apiFormat: "chat-completions",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-secret-123",
      customHeaders: [],
      enabled: true,
      status: "connected",
      createdAt: new Date().toISOString(),
    });

    expect(localStorage.getItem("talkio:secret:p1")).toBe("sk-secret-123");
  });

  it("hydrates apiKey back into the in-memory provider on load", async () => {
    // Seed storage like an older build would (key in blob) plus the secret.
    localStorage.setItem(
      "talkio:providers",
      JSON.stringify([
        {
          id: "p1",
          name: "OpenAI",
          type: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-legacy",
          customHeaders: [],
          enabled: true,
          status: "connected",
          createdAt: new Date().toISOString(),
        },
      ]),
    );

    const store = await loadStore();
    // Wait for the async hydrate (queueMicrotask + secret reads).
    await vi.waitFor(() => {
      const p = store.getState().getProviderById("p1");
      expect(p?.apiKey).toBe("sk-legacy");
    });
  });

  it("migrates legacy blob keys into the secret store and strips the blob", async () => {
    localStorage.setItem(
      "talkio:providers",
      JSON.stringify([
        {
          id: "p1",
          name: "OpenAI",
          type: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-legacy",
          customHeaders: [],
          enabled: true,
          status: "connected",
          createdAt: new Date().toISOString(),
        },
      ]),
    );

    const store = await loadStore();
    await vi.waitFor(() => {
      expect(localStorage.getItem("talkio:secret:p1")).toBe("sk-legacy");
    });
    const blob = JSON.parse(localStorage.getItem("talkio:providers") ?? "[]");
    expect(blob[0].apiKey).toBeUndefined();
    expect(store.getState().getProviderById("p1")?.apiKey).toBe("sk-legacy");
  });

  it("deletes the secret when the provider is removed", async () => {
    const store = await loadStore();
    store.getState().addProvider({
      id: "p1",
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-secret-123",
      customHeaders: [],
      enabled: true,
      status: "connected",
      createdAt: new Date().toISOString(),
    });
    expect(localStorage.getItem("talkio:secret:p1")).toBe("sk-secret-123");

    store.getState().deleteProvider("p1");
    expect(localStorage.getItem("talkio:secret:p1")).toBeNull();
  });

  it("clears the secret when updateProvider receives an empty apiKey", async () => {
    const store = await loadStore();
    store.getState().addProvider({
      id: "p1",
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-secret-123",
      customHeaders: [],
      enabled: true,
      status: "connected",
      createdAt: new Date().toISOString(),
    });
    store.getState().updateProvider("p1", { apiKey: "" });
    expect(localStorage.getItem("talkio:secret:p1")).toBeNull();
  });
});
