import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

const { mockUseSettingsStore } = vi.hoisted(() => ({
  mockUseSettingsStore: {
    getState: vi.fn(() => ({ settings: { toolApprovalMode: "auto" as const } })),
  },
}));
vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: mockUseSettingsStore,
}));

import { toolApproval } from "../tool-approval";

function setMode(mode: "auto" | "ask") {
  (mockUseSettingsStore.getState as Mock).mockReturnValue({ settings: { toolApprovalMode: mode } });
}

describe("toolApproval", () => {
  beforeEach(() => {
    toolApproval.rejectAll();
    setMode("auto");
  });

  it("auto mode resolves immediately without approval", async () => {
    const decided = await toolApproval.request({
      toolName: "read_file",
      args: { path: "/tmp/x" },
      risk: "read",
    });
    expect(decided).toBe(true);
    expect(toolApproval.getPending()).toHaveLength(0);
  });

  it("ask mode parks the request until resolved", async () => {
    setMode("ask");
    let decided: boolean | null = null;
    const promise = toolApproval
      .request({ toolName: "write_file", args: { path: "/tmp/x" }, risk: "write" })
      .then((ok) => {
        decided = ok;
      });

    // Nothing decided yet, one pending entry.
    await Promise.resolve();
    expect(decided).toBeNull();
    expect(toolApproval.getPending()).toHaveLength(1);
    expect(toolApproval.getPending()[0].toolName).toBe("write_file");
    expect(toolApproval.getPending()[0].args).toEqual({ path: "/tmp/x" });

    toolApproval.resolve(toolApproval.getPending()[0].id, true);
    await promise;
    expect(decided).toBe(true);
    expect(toolApproval.getPending()).toHaveLength(0);
  });

  it("reject resolves the request as false", async () => {
    setMode("ask");
    let decided: boolean | null = null;
    const promise = toolApproval
      .request({ toolName: "delete_file", args: { path: "/tmp/x" }, risk: "write" })
      .then((ok) => {
        decided = ok;
      });
    toolApproval.resolve(toolApproval.getPending()[0].id, false);
    await promise;
    expect(decided).toBe(false);
  });

  it("rejectAll unblocks every pending request as rejected", async () => {
    setMode("ask");
    const results: boolean[] = [];
    const p1 = toolApproval
      .request({ toolName: "a", args: {}, risk: "unknown" })
      .then((ok) => results.push(ok));
    const p2 = toolApproval
      .request({ toolName: "b", args: {}, risk: "unknown" })
      .then((ok) => results.push(ok));
    expect(toolApproval.getPending()).toHaveLength(2);

    toolApproval.rejectAll();
    await Promise.all([p1, p2]);
    expect(results).toEqual([false, false]);
    expect(toolApproval.getPending()).toHaveLength(0);
  });

  it("subscribers are notified of pending changes", () => {
    setMode("ask");
    const notified: number[] = [];
    const unsubscribe = toolApproval.subscribe(() =>
      notified.push(toolApproval.getPending().length),
    );

    void toolApproval.request({ toolName: "a", args: {}, risk: "unknown" });
    expect(notified[notified.length - 1]).toBe(1);
    toolApproval.rejectAll();
    expect(notified[notified.length - 1]).toBe(0);
    unsubscribe();
    void toolApproval.request({ toolName: "b", args: {}, risk: "unknown" });
    expect(notified[notified.length - 1]).toBe(0);
  });

  it("unknown ids are ignored by resolve", () => {
    setMode("ask");
    expect(() => toolApproval.resolve("nope", true)).not.toThrow();
    expect(toolApproval.getPending()).toHaveLength(0);
  });
});
