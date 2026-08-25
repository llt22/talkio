import { beforeEach, describe, expect, it, vi } from "vitest";

const { appFetch } = vi.hoisted(() => ({ appFetch: vi.fn() }));

vi.mock("../../lib/http", () => ({ appFetch }));

const settings = {
  imageBaseUrl: "https://gateway.test/v1",
  imageApiKey: "test-key",
  imageModel: "gpt-image-1",
};
vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: { getState: () => ({ settings }) },
}));

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe("image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(settings, {
      imageBaseUrl: "https://gateway.test/v1",
      imageApiKey: "test-key",
      imageModel: "gpt-image-1",
    });
  });

  it("posts the prompt to /images/generations and returns a data URL", async () => {
    appFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "QUJD" }] }));
    const { generateImages } = await import("../image-generation");

    expect(await generateImages({ prompt: "a red cube", size: "1024x1024" })).toEqual([
      "data:image/png;base64,QUJD",
    ]);
    const [url, init] = appFetch.mock.calls[0];
    expect(url).toBe("https://gateway.test/v1/images/generations");
    expect(JSON.parse(init.body)).toEqual({
      model: "gpt-image-1",
      prompt: "a red cube",
      n: 1,
      size: "1024x1024",
    });
  });

  it("downloads hosted images when the gateway answers with a url", async () => {
    appFetch
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "https://cdn.test/a.webp" }] }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/webp" }),
        arrayBuffer: async () => new Uint8Array([65, 66, 67]).buffer,
      });
    const { generateImages } = await import("../image-generation");

    expect(await generateImages({ prompt: "a red cube" })).toEqual(["data:image/webp;base64,QUJD"]);
  });

  it("surfaces the endpoint error instead of returning nothing", async () => {
    appFetch.mockResolvedValue({ ok: false, status: 503, text: async () => "model unavailable" });
    const { generateImages } = await import("../image-generation");

    await expect(generateImages({ prompt: "a red cube" })).rejects.toThrow(
      "Image API Error 503: model unavailable",
    );
  });

  it("rejects an empty result rather than reporting success", async () => {
    appFetch.mockResolvedValue(jsonResponse({ data: [] }));
    const { generateImages } = await import("../image-generation");

    await expect(generateImages({ prompt: "a red cube" })).rejects.toThrow("returned no images");
  });

  it("is unconfigured until base URL, key and model are all set", async () => {
    const { isImageGenerationConfigured } = await import("../image-generation");
    expect(isImageGenerationConfigured()).toBe(true);
    settings.imageApiKey = "";
    expect(isImageGenerationConfigured()).toBe(false);
  });
});

describe("generate_image tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(settings, {
      imageBaseUrl: "https://gateway.test/v1",
      imageApiKey: "test-key",
      imageModel: "gpt-image-1",
    });
  });

  it("returns images out of band, never inside the tool result text", async () => {
    appFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: "QUJD" }] }));
    const { executeBuiltInTool } = await import("../built-in-tools");

    const result = await executeBuiltInTool("generate_image", { prompt: "a red cube" });
    expect(result?.success).toBe(true);
    expect(result?.images).toEqual(["data:image/png;base64,QUJD"]);
    expect(result?.content).not.toContain("QUJD");
  });

  it("reports the failure instead of pretending an image was drawn", async () => {
    appFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" });
    const { executeBuiltInTool } = await import("../built-in-tools");

    const result = await executeBuiltInTool("generate_image", { prompt: "a red cube" });
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("401");
  });

  it("is offered to the model only once an image endpoint is configured", async () => {
    const { getBuiltInToolDefs } = await import("../built-in-tools");
    const names = () => getBuiltInToolDefs().map((d) => d.function.name);

    expect(names()).toContain("generate_image");
    settings.imageModel = "";
    expect(names()).not.toContain("generate_image");
  });
});
