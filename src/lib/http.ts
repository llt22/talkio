// Always prefer Tauri HTTP plugin when running inside Tauri, because:
// 1. It bypasses CORS (many AI APIs don't support preflight)
// 2. It runs requests in Rust, not limited by WebView security
// Falls back to native fetch when Tauri is not available (plain browser).
let _tauriFetch: typeof globalThis.fetch | null = null;
let _resolved = false;

async function resolveTauriFetch(): Promise<typeof globalThis.fetch | null> {
  if (_resolved) return _tauriFetch;
  _resolved = true;
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const mod = await import("@tauri-apps/plugin-http");
      _tauriFetch = mod.fetch as unknown as typeof globalThis.fetch;
    } catch { /* plugin not available */ }
  }
  return _tauriFetch;
}

export async function appFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const tauriFn = await resolveTauriFetch();
  if (tauriFn) {
    try {
      return await tauriFn(input, init);
    } catch (err: any) {
      // If Tauri fetch fails due to scope restriction, fall back to native fetch.
      // This handles the macOS bug where IP:port URLs fail scope matching.
      const msg = typeof err === "string" ? err : err?.message ?? "";
      if (msg.includes("url not allowed")) {
        return globalThis.fetch(input, init);
      }
      throw err;
    }
  }
  return globalThis.fetch(input, init);
}
