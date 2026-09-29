"use client";

/**
 * Providers, in two layers.
 *
 * SiteProviders (app/layout.tsx, every page): the i18next instance and the
 * signed-in flag. They sit at the root because the explore header is the
 * site-wide top bar and needs t() and the language switch on every page.
 *
 * ExploreProviders (app/explore/layout.tsx): what only the /explore flow
 * needs - the selection store.
 *
 * The server renders in the language its cookie names (`initialLang`). On
 * mount, a saved localStorage choice that disagrees wins - the cookie may
 * have been cleared, or never set on this device - and the page switches.
 */

import { useRouter } from "next/navigation";
import { createContext, startTransition, useCallback, useContext, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";

import { ExploreStateProvider } from "@/components/explore/state";
import { createExploreI18n, persistLanguage, readStoredLanguage } from "@/lib/explore-i18n";
import { INTL_LOCALE, isLocale, type Locale } from "@/lib/i18n";

const SignedInContext = createContext(false);

/** Whether a session cookie is present - so signed-out visitors skip account calls. */
export function useSignedIn(): boolean {
  return useContext(SignedInContext);
}

export function SiteProviders({
  initialLang,
  signedIn,
  children,
}: {
  initialLang: Locale;
  signedIn: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const [i18n] = useState(() => createExploreI18n(initialLang));

  useEffect(() => {
    const stored = readStoredLanguage();
    const lang = stored ?? initialLang;
    // A transition, so a part of the page still hydrating from the server's
    // HTML finishes in the server's language first, then switches - rather
    // than being thrown away and re-rendered (a hydration mismatch).
    if (lang !== i18n.language) startTransition(() => void i18n.changeLanguage(lang));
    // First visit: record the default, so the next visit starts from a choice.
    persistLanguage(lang);
  }, [i18n, initialLang]);

  return (
    <I18nextProvider i18n={i18n}>
      <SignedInContext.Provider value={signedIn}>{children}</SignedInContext.Provider>
    </I18nextProvider>
  );
}

export default function ExploreProviders({ children }: { children: React.ReactNode }): JSX.Element {
  return <ExploreStateProvider>{children}</ExploreStateProvider>;
}

/** The current language, and a setter that saves it and re-renders the server parts. */
export function useLanguage(): [Locale, (lang: Locale) => void] {
  const { i18n } = useTranslation();
  const router = useRouter();
  const current = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";

  const change = useCallback(
    (lang: Locale) => {
      if (lang === current) return;
      // See the mount effect above: a transition, for the same reason.
      startTransition(() => void i18n.changeLanguage(lang));
      persistLanguage(lang);
      // The footer and page titles are rendered on the server from the
      // cookie just written; refresh them without losing client state.
      router.refresh();
    },
    [current, i18n, router],
  );

  return [current, change];
}

/**
 * t() plus the locale in the two shapes other code wants: our short code for
 * the shared lib/i18n components, and the BCP-47 tag for Intl formatting.
 */
export function useExploreT(): { t: TFunction; locale: Locale; intl: string } {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.resolvedLanguage === "fr" ? "fr" : "en";
  return { t, locale, intl: INTL_LOCALE[locale] };
}
