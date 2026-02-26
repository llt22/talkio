let tauriFetch: typeof globalThis.fetch | null = null;
let resolved = false;

async function ensureTauriFetch(): Promise<typeof globalThis.fetch> {
  if (resolved) return tauriFetch ?? globalThis.fetch;
  resolved = true;
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const mod = await import("@tauri-apps/plugin-http");
      tauriFetch = mod.fetch as unknown as typeof globalThis.fetch;
    } catch {
      // fallback to browser fetch
    }
  }
  return tauriFetch ?? globalThis.fetch;
}

export async function appFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const fn = await ensureTauriFetch();
  return fn(input, init);
}

