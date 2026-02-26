// On mobile (Android/iOS) we must use Tauri's HTTP plugin to bypass CORS.
// On desktop we use native fetch + CSP connect-src * instead, because
// Tauri HTTP plugin scope matching fails for IP:port URLs on macOS.
let _fetch: typeof globalThis.fetch | null = null;

async function resolve(): Promise<typeof globalThis.fetch> {
  if (_fetch) return _fetch;
  const w = window as any;
  const isMobile = !!w.__TAURI_IOS__ || !!w.__TAURI_ANDROID__;
  if (w.__TAURI_INTERNALS__ && isMobile) {
    try {
      const mod = await import("@tauri-apps/plugin-http");
      _fetch = mod.fetch as unknown as typeof globalThis.fetch;
      return _fetch;
    } catch { /* fallback */ }
  }
  _fetch = globalThis.fetch.bind(globalThis);
  return _fetch;
}

export async function appFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return (await resolve())(input, init);
}
