/**
 * Global type declarations for window properties used across the app.
 */

export {};

declare global {
  const __APP_VERSION__: string;
  interface Window {
    /** Stackflow back navigation bridge for Android native back button */
    __stackflowBack?: () => boolean;
    /** Tauri internals — present when running inside Tauri webview */
    __TAURI_INTERNALS__?: Record<string, unknown>;
  }
}
