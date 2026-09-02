/**
 * Settings Store — manages app settings (theme, language, STT config).
 * Migrated from RN src/stores/settings-store.ts, using localStorage instead of MMKV.
 */
import { create } from "zustand";
import { kvStore } from "../storage/kv-store";
import type { ToolApprovalMode } from "../services/tool-approval";

export interface AppSettings {
  language: "system" | "en" | "zh";
  theme: "light" | "dark" | "system";
  hapticFeedback: boolean;
  voiceAutoTranscribe: boolean;
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
  /** Enable automatic context compression when token count exceeds threshold */
  contextCompressionEnabled: boolean;
  /** Token threshold to trigger compression (default: 8000) */
  contextCompressionThreshold: number;
  /** Enter key behavior on desktop: true = Enter sends (default), false = Enter inserts newline */
  enterToSend: boolean;
  /** Tool execution gate: "auto" runs tools without asking, "ask" requires user approval */
  toolApprovalMode: ToolApprovalMode;
  /** Desktop only: closing the main window hides it to the system tray instead of quitting */
  closeToTray: boolean;
  /** OpenAI-compatible image endpoint backing the generate_image tool */
  imageBaseUrl: string;
  imageApiKey: string;
  imageModel: string;
}

interface SettingsState {
  settings: AppSettings;
  loadFromStorage: () => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  language: "system",
  theme: "system",
  hapticFeedback: true,
  voiceAutoTranscribe: true,
  sttBaseUrl: "https://api.groq.com/openai/v1",
  sttApiKey: "",
  sttModel: "whisper-large-v3-turbo",
  contextCompressionEnabled: false,
  contextCompressionThreshold: 16000,
  enterToSend: true,
  toolApprovalMode: "auto",
  closeToTray: false,
  imageBaseUrl: "https://api.openai.com/v1",
  imageApiKey: "",
  imageModel: "gpt-image-1",
};

const SETTINGS_KEY = "settings";

let removeSystemThemeListener: (() => void) | null = null;

function syncNativeTheme(theme: AppSettings["theme"]) {
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme === "system" ? null : theme))
    .catch((error) => console.warn("[Settings] native theme sync failed:", error));
}

function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    root.classList.toggle("dark", prefersDark.matches);
  }
  // Update status bar / theme-color to match background for mobile browsers & Tauri Android
  const isDark = root.classList.contains("dark");
  const themeColor = isDark ? "#000000" : "#ffffff";
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = themeColor;
  // Also set color-scheme for proper system UI adaptation
  root.style.colorScheme = isDark ? "dark" : "light";
  syncNativeTheme(theme);

  // Keep both the web UI and native system bars current when following the OS.
  removeSystemThemeListener?.();
  removeSystemThemeListener = null;
  if (theme === "system") {
    const onChange = () => applyTheme("system");
    prefersDark.addEventListener?.("change", onChange);
    // Older WebViews expose the legacy listener API only.
    if (!prefersDark.addEventListener && prefersDark.addListener) prefersDark.addListener(onChange);
    removeSystemThemeListener = () => {
      prefersDark.removeEventListener?.("change", onChange);
      if (!prefersDark.removeEventListener && prefersDark.removeListener) {
        prefersDark.removeListener(onChange);
      }
    };
  }
}

function loadInitialSettings(): AppSettings {
  const stored = kvStore.getObject<AppSettings>(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  applyTheme(settings.theme);
  return settings;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadInitialSettings(),

  loadFromStorage: () => {
    const stored = kvStore.getObject<AppSettings>(SETTINGS_KEY);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    set({ settings });
    applyTheme(settings.theme);
  },

  updateSettings: (updates) => {
    const settings = { ...get().settings, ...updates };
    set({ settings });
    kvStore.setObject(SETTINGS_KEY, settings);
    if (updates.theme !== undefined) {
      applyTheme(updates.theme);
    }
  },
}));
