import { describe, it, expect, beforeEach, vi } from "vitest";

// kvStore reads localStorage at module load — install a memory stub first.
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
import {
  MODEL_CATALOG,
  resolveModelDescriptor,
  getAllModelDescriptors,
  setModelOverride,
  resetModelOverrides,
} from "../model-catalog";

describe("model catalog", () => {
  beforeEach(() => {
    resetModelOverrides();
  });

  it("resolves known models from the built-in catalog", () => {
    const gpt4o = resolveModelDescriptor("gpt-4o");
    expect(gpt4o?.displayName).toBe("GPT-4o");
    expect(gpt4o?.contextWindow).toBe(128000);
    expect(gpt4o?.capabilities?.tools).toBe(true);
  });

  it("returns undefined for unknown models without overrides", () => {
    expect(resolveModelDescriptor("no-such-model")).toBeUndefined();
  });

  it("user override wins over the built-in entry", () => {
    setModelOverride("gpt-4o", { contextWindow: 999999, displayName: "Custom GPT-4o" });
    const resolved = resolveModelDescriptor("gpt-4o")!;
    expect(resolved.contextWindow).toBe(999999);
    expect(resolved.displayName).toBe("Custom GPT-4o");
    // Non-overridden fields still come from the catalog.
    expect(resolved.capabilities?.tools).toBe(true);
  });

  it("an override alone creates a descriptor for an unknown model", () => {
    setModelOverride("custom-model", { contextWindow: 8192, displayName: "Custom" });
    const resolved = resolveModelDescriptor("custom-model")!;
    expect(resolved.displayName).toBe("Custom");
    expect(resolved.contextWindow).toBe(8192);
    expect(resolved.modelId).toBe("custom-model");
  });

  it("an empty patch removes the override", () => {
    setModelOverride("gpt-4o", { contextWindow: 1 });
    setModelOverride("gpt-4o", {});
    expect(resolveModelDescriptor("gpt-4o")?.contextWindow).toBe(128000);
  });

  it("getAllModelDescriptors applies overrides to the full catalog", () => {
    setModelOverride("gpt-4o", { contextWindow: 1234 });
    const all = getAllModelDescriptors();
    expect(all.find((m) => m.modelId === "gpt-4o")?.contextWindow).toBe(1234);
    expect(all.length).toBe(MODEL_CATALOG.length);
  });
});
