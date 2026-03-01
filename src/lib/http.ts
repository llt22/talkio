// Tauri HTTP plugin bypasses CORS but has a scope-matching bug on macOS
// that rejects IP:port URLs (throws "Load failed" in release builds).
//
// Strategy:
// - Mobile (iOS/Android): always use Tauri fetch (native fetch blocked by CORS)
// - Desktop: try Tauri fetch first; on ANY error, fall back to native fetch
//   (CSP connect-src * http: https: in tauri.conf.json allows native fetch to reach all URLs)
import { isTauri, isMobile as _isMobile } from "./platform";

let _tauriFetch: typeof globalThis.fetch | null = null;
let _resolved = false;

async function resolve(): Promise<void> {
  if (_resolved) return;
  _resolved = true;
  if (isTauri) {
    try {
      const mod = await import("@tauri-apps/plugin-http");
      _tauriFetch = mod.fetch as unknown as typeof globalThis.fetch;
    } catch {
      /* plugin not available */
    }
  }
}

export async function appFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  await resolve();
  if (_tauriFetch) {
    try {
      return await _tauriFetch(input, init);
    } catch (err) {
      // On desktop, fall back to native fetch for any Tauri fetch error
      // (handles macOS scope bug with IP:port URLs).
      // On mobile, re-throw because native fetch won't work (CORS).
      if (!_isMobile) {
        console.warn("[appFetch] Tauri fetch failed, falling back to native fetch:", err);
        return globalThis.fetch(input, init);
      }
      throw err;
    }
  }
  return globalThis.fetch(input, init);
}
