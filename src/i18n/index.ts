import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

// Detect browser language
const browserLang = navigator.language?.split("-")[0] ?? "en";
const supportedLngs = ["en", "zh"];
const defaultLng = supportedLngs.includes(browserLang) ? browserLang : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: defaultLng,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
