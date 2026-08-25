/**
 * OpenAI-compatible image generation.
 *
 * Image models live behind `/images/generations`, not `/chat/completions`, so
 * they cannot be driven by the chat adapters — a gateway asked to run
 * `gpt-image-2` as a chat model simply refuses. This module is the one caller of
 * that endpoint; the `generate_image` built-in tool is what exposes it to a
 * conversation.
 */
import { appFetch } from "../lib/http";
import { useSettingsStore } from "../stores/settings-store";

/** Image endpoint config, or null when the user has not set one up. */
function readConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const { imageBaseUrl, imageApiKey, imageModel } = useSettingsStore.getState().settings;
  if (!imageBaseUrl.trim() || !imageApiKey.trim() || !imageModel.trim()) return null;
  return { baseUrl: imageBaseUrl.trim(), apiKey: imageApiKey.trim(), model: imageModel.trim() };
}

export function isImageGenerationConfigured(): boolean {
  return readConfig() !== null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Some gateways answer with a hosted URL instead of inline base64. */
async function fetchAsDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await appFetch(url, { signal });
  if (!res.ok) throw new Error(`Cannot download generated image: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/png";
  return `data:${mime};base64,${toBase64(bytes)}`;
}

export interface GenerateImagesParams {
  prompt: string;
  size?: string;
  signal?: AbortSignal;
}

/**
 * Generate images and return them as `data:` URLs.
 *
 * Throws when the endpoint is unconfigured, the request fails, or the response
 * carries no usable image — a silent empty result would look to the model like
 * a successful call that produced nothing.
 */
export async function generateImages(params: GenerateImagesParams): Promise<string[]> {
  const config = readConfig();
  if (!config) throw new Error("Image generation is not configured in settings");

  const body: Record<string, unknown> = { model: config.model, prompt: params.prompt, n: 1 };
  if (params.size) body.size = params.size;

  const res = await appFetch(`${config.baseUrl.replace(/\/+$/, "")}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image API Error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const items = data.data ?? [];
  if (items.length === 0) throw new Error("Image API returned no images");

  const images: string[] = [];
  for (const item of items) {
    if (item.b64_json) images.push(`data:image/png;base64,${item.b64_json}`);
    else if (item.url) images.push(await fetchAsDataUrl(item.url, params.signal));
    else throw new Error("Image API returned an entry with neither b64_json nor url");
  }
  return images;
}
