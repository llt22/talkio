import { beforeEach, describe, expect, it, vi } from "vitest";

const { bridge } = vi.hoisted(() => {
  const bridge = {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  };
  const localStorage = { removeItem: vi.fn() };
  Object.assign(globalThis, { window: { TalkioSecretStore: bridge }, localStorage });
  return { bridge };
});

vi.mock("../../lib/platform", () => ({ isAndroid: true, isDesktop: false }));

describe("Android provider secret persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    bridge.set.mockReturnValue(JSON.stringify({ ok: true, value: null }));
    bridge.get.mockReturnValue(JSON.stringify({ ok: true, value: "android-secret" }));
    bridge.delete.mockReturnValue(JSON.stringify({ ok: true, value: null }));
  });

  it("persists and hydrates secrets through the native bridge", async () => {
    const { secretStore } = await import("../secret-store");
    await secretStore.set("provider-1", "android-secret");
    expect(bridge.set).toHaveBeenCalledWith("provider-1", "android-secret");
    expect(secretStore.getSync("provider-1")).toBe("android-secret");
  });

  it("does not publish a secret when native persistence fails", async () => {
    bridge.set.mockReturnValue(JSON.stringify({ ok: false, error: "Keystore unavailable" }));
    const { secretStore } = await import("../secret-store");

    await expect(secretStore.set("provider-2", "new-secret")).rejects.toThrow(
      "Keystore unavailable",
    );
    expect(secretStore.getSync("provider-2")).toBeUndefined();
  });

  it("loads an encrypted secret after a fresh module start", async () => {
    const { secretStore } = await import("../secret-store");
    expect(await secretStore.get("provider-3")).toBe("android-secret");
    expect(bridge.get).toHaveBeenCalledWith("provider-3");
  });
});
