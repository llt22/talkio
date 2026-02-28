/**
 * Platform detection utilities.
 * Centralizes Tauri platform flags so other modules don't scatter UA sniffing.
 *
 * Detection strategy:
 * 1. Tauri window flags (__TAURI_ANDROID__, __TAURI_IOS__) — preferred
 * 2. User-Agent fallback — for Tauri v2 where window flags may not be set
 */

const w = typeof window !== "undefined" ? (window as any) : ({} as any);
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

/** Running inside a Tauri webview (desktop or mobile) */
export const isTauri: boolean = "__TAURI_INTERNALS__" in w || "__TAURI__" in w;

/** Running on Android (Tauri mobile) */
export const isAndroid: boolean = !!w.__TAURI_ANDROID__ || /android/i.test(ua);

/** Running on iOS (Tauri mobile) */
export const isIOS: boolean = !!w.__TAURI_IOS__ || /iphone|ipad|ipod/i.test(ua);

/** Running on mobile (Android or iOS) */
export const isMobile: boolean = isAndroid || isIOS;

/** Running on desktop Tauri (macOS / Windows / Linux) */
export const isDesktop: boolean = isTauri && !isMobile;
