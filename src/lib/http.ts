let tauriFetch: typeof globalThis.fetch | null = null;
let resolved = false;

// Detect if running on mobile (Android/iOS) where Tauri fetch is needed to bypass CORS.
// On desktop (macOS/Windows/Linux), use native browser fetch with CSP connect-src * instead,
// because Tauri HTTP plugin scope matching has issues with IP:port URLs on macOS.
function isMobilePlatform(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod/i.test(ua) || (window as any).__TAURI_IOS__ || (window as any).__TAURI_ANDROID__;
}

async function ensureTauriFetch(): Promise<typeof globalThis.fetch> {
  if (resolved) return tauriFetch ?? globalThis.fetch;
  resolved = true;
  if ((window as any).__TAURI_INTERNALS__ && isMobilePlatform()) {
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

