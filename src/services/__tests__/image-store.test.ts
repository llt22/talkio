import { beforeEach, describe, expect, it, vi } from "vitest";

const { fs } = vi.hoisted(() => ({
  fs: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readDir: vi.fn(),
    remove: vi.fn(),
    mkdir: vi.fn(),
    exists: vi.fn(),
    BaseDirectory: { AppData: 2 },
  },
}));

vi.mock("../../lib/platform", () => ({ isTauri: true }));
vi.mock("@tauri-apps/plugin-fs", () => fs);

// 1x1 transparent PNG.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

describe("generated-image storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fs.exists.mockResolvedValue(true);
    fs.writeFile.mockResolvedValue(undefined);
  });

  it("tells inline images apart from stored references", async () => {
    const { isInlineImage } = await import("../image-store");
    expect(isInlineImage(PNG)).toBe(true);
    expect(isInlineImage("a1b2.png")).toBe(false);
  });

  it("writes the decoded bytes to disk and returns a file reference", async () => {
    const { persistGeneratedImage } = await import("../image-store");
    const ref = await persistGeneratedImage(PNG);

    expect(ref).toMatch(/^[0-9a-f-]+\.png$/);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const [path, bytes] = fs.writeFile.mock.calls[0];
    expect(path).toBe(`generated-images/${ref}`);
    // PNG magic number — proves the base64 was decoded, not stored as text.
    expect(Array.from((bytes as Uint8Array).slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("creates the image directory the first time", async () => {
    fs.exists.mockResolvedValue(false);
    const { persistGeneratedImage } = await import("../image-store");
    await persistGeneratedImage(PNG);
    expect(fs.mkdir).toHaveBeenCalledWith(
      "generated-images",
      expect.objectContaining({ recursive: true }),
    );
  });

  it("leaves an already-stored reference untouched", async () => {
    const { persistGeneratedImages } = await import("../image-store");
    const refs = await persistGeneratedImages(["kept.png", PNG]);

    expect(refs[0]).toBe("kept.png");
    expect(refs[1]).not.toBe(PNG);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it("keeps the image inline when the write fails", async () => {
    fs.writeFile.mockRejectedValue(new Error("disk full"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { persistGeneratedImage } = await import("../image-store");

    expect(await persistGeneratedImage(PNG)).toBe(PNG);
    warn.mockRestore();
  });

  it("removes only the files no message references", async () => {
    fs.readDir.mockResolvedValue([
      { name: "kept.png", isFile: true },
      { name: "orphan.png", isFile: true },
      { name: "nested", isFile: false },
    ]);
    const { pruneOrphanImages } = await import("../image-store");

    expect(await pruneOrphanImages(new Set(["kept.png"]))).toBe(1);
    expect(fs.remove).toHaveBeenCalledTimes(1);
    expect(fs.remove).toHaveBeenCalledWith("generated-images/orphan.png", expect.anything());
  });
});
