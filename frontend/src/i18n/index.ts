import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/i18n/locales/en";
import hi from "@/i18n/locales/hi";
import type { Language } from "@/types";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function changeAppLanguage(language: Language): Promise<unknown> {
  return i18n.changeLanguage(language);
}

export { i18n };