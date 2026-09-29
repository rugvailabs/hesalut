/**
 * The visitor's language, on the server.
 *
 * The top bar's EN/FR switch (components/explore/ExploreHeader.tsx) writes
 * the `jfy_lang` cookie and refreshes the page, so every Server Component
 * that reads the language through here re-renders in the new one.
 *
 * Call it inside a component or function that runs per request - never at
 * module level, where it would be evaluated once for every visitor.
 */

import { cookies } from "next/headers";
import { cache } from "react";

import { LANG_COOKIE } from "@/lib/explore-i18n/constants";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";

export const getLocale = cache((): Locale => {
  const saved = cookies().get(LANG_COOKIE)?.value;
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
});
