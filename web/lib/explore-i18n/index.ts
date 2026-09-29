/**
 * i18next for the /explore flow.
 *
 * Where the language comes from, in order:
 *   1. localStorage (`jfy.lang`) - the visitor's saved choice. The source of
 *      truth, so it survives closing the browser.
 *   2. The `jfy_lang` cookie - a copy of the same choice that the server can
 *      read, so the first render is already in the right language instead of
 *      flashing English and then switching.
 *   3. English.
 *
 * Both are written together whenever the language changes (see
 * persistLanguage), and on load a localStorage value that disagrees with the
 * cookie wins and rewrites it.
 */

import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";

import { LANG_COOKIE, LANG_STORAGE_KEY } from "@/lib/explore-i18n/constants";
import { RESOURCES } from "@/lib/explore-i18n/resources";
import { INTL_LOCALE, isLocale, type Locale } from "@/lib/i18n";

export { LANG_COOKIE, LANG_STORAGE_KEY };
const ONE_YEAR = 60 * 60 * 24 * 365;

export function createExploreI18n(lang: Locale): I18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: lang,
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],
    resources: RESOURCES,
    ns: ["explore"],
    defaultNS: "explore",
    // Resources are bundled, so there is nothing to wait for: initialise
    // synchronously and the first render already has its strings.
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes
    react: { useSuspense: false },
  });
  return instance;
}

/** The saved choice, or null when there is none (or storage is blocked). */
export function readStoredLanguage(): Locale | null {
  try {
    const value = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Save the choice everywhere it is read from, and label the document. */
export function persistLanguage(lang: Locale): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Private mode or blocked storage: the cookie still carries it.
  }
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  document.documentElement.lang = INTL_LOCALE[lang];
}
