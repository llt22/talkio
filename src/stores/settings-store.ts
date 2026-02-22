import { create } from "zustand";
import { getLocales } from "expo-localization";
import i18n from "../i18n";
import { getItem, setItem } from "../storage/mmkv";
import { STORAGE_KEYS } from "../constants";

interface AppSettings {
  language: "system" | "en" | "zh";
  theme: "light" | "dark" | "system";
  hapticFeedback: boolean;
  voiceAutoTranscribe: boolean;
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
}

interface SettingsState {
  settings: AppSettings;
  loadSettings: () => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  language: "system",
  theme: "light",
  hapticFeedback: true,
  voiceAutoTranscribe: true,
  sttBaseUrl: "https://api.groq.com/openai/v1",
  sttApiKey: "",
  sttModel: "whisper-large-v3-turbo",
};

function applyLanguage(lang: AppSettings["language"]) {
  const resolved =
    lang === "system"
      ? (getLocales()[0]?.languageCode ?? "en")
      : lang;
  const supported = ["en", "zh"];
  i18n.changeLanguage(supported.includes(resolved) ? resolved : "en");
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  loadSettings: () => {
    const stored = getItem<AppSettings>(STORAGE_KEYS.SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    set({ settings });
    applyLanguage(settings.language);
  },

  updateSettings: (updates) => {
    const settings = { ...get().settings, ...updates };
    set({ settings });
    setItem(STORAGE_KEYS.SETTINGS, settings);
    if (updates.language !== undefined) {
      applyLanguage(updates.language);
    }
  },
}));
