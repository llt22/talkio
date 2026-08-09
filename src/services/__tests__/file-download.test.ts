import { afterEach, describe, expect, it, vi } from "vitest";
import { saveOrShareBlobs } from "../file-download";

describe("binary file sharing", () => {
  const originalWindow = globalThis.window;
  const originalFileReader = globalThis.FileReader;

  afterEach(() => {
    Object.assign(globalThis, { window: originalWindow, FileReader: originalFileReader });
  });

  it("shares PNG slices through one Android multi-file intent", async () => {
    const shareBase64Files = vi.fn();
    Object.assign(globalThis, {
      window: { NativeShare: { shareBase64Files } },
      FileReader: class {
        result: string | null = null;
        error: Error | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsDataURL() {
          this.result = "data:image/png;base64,cG5n";
          this.onload?.();
        }
      },
    });

    await saveOrShareBlobs(
      [
        { filename: "conversation-01.png", content: new Blob(["one"]) },
        { filename: "conversation-02.png", content: new Blob(["two"]) },
      ],
      { mimeType: "image/png", filterName: "PNG", filterExtensions: ["png"] },
    );

    expect(shareBase64Files).toHaveBeenCalledOnce();
    const [payload, mimeType] = shareBase64Files.mock.calls[0];
    expect(JSON.parse(payload)).toEqual([
      { filename: "conversation-01.png", content: "cG5n" },
      { filename: "conversation-02.png", content: "cG5n" },
    ]);
    expect(mimeType).toBe("image/png");
  });
});
