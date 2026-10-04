/**
 * Which of Canada's two languages the device is set to.
 *
 * The app has no i18n layer - every string is English - but search
 * understanding and voice recognition both work better when told the language
 * the person is actually typing or speaking in. The device locale is the best
 * signal available, and Hermes exposes it through Intl without pulling in
 * expo-localization for one lookup.
 */

export type AppLanguage = "en" | "fr";

export function deviceLanguage(): AppLanguage {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    return tag.toLowerCase().startsWith("fr") ? "fr" : "en";
  } catch {
    return "en";
  }
}

/** The recogniser's locale: Canadian French or Canadian English. */
export function speechLocale(lang: AppLanguage): string {
  return lang === "fr" ? "fr-CA" : "en-CA";
}
