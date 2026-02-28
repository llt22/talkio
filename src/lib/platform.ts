/**
 * Platform detection utilities.
 * Centralizes Tauri platform flags so other modules don't scatter UA sniffing.
 */

const w = typeof window !== "undefined" ? (window as any) : ({} as any);

/** Running inside a Tauri webview (desktop or mobile) */
export const isTauri: boolean = "__TAURI_INTERNALS__" in w || "__TAURI__" in w;

/** Running on Android (Tauri mobile) */
export const isAndroid: boolean = !!w.__TAURI_ANDROID__;

/** Running on iOS (Tauri mobile) */
export const isIOS: boolean = !!w.__TAURI_IOS__;

/** Running on mobile (Android or iOS) */
export const isMobile: boolean = isAndroid || isIOS;

/** Running on desktop Tauri (macOS / Windows / Linux) */
export const isDesktop: boolean = isTauri && !isMobile;
