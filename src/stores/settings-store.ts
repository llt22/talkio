/**
 * Settings Store — manages app settings (theme, language, STT config).
 * Migrated from RN src/stores/settings-store.ts, using localStorage instead of MMKV.
 */
import { create } from "zustand";
import { kvStore } from "../storage/kv-store";

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
  /** Workspace directory for AI file output */
  workspaceDir: string;
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
  workspaceDir: "",
};

const SETTINGS_KEY = "settings";

function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
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
