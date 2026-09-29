/**
 * The two-step explore flow: /explore (choose) and /explore/results.
 *
 * This layout stays mounted while the visitor moves between the two steps,
 * which is what lets the selection store live here and survive the trip in
 * both directions. The language comes from the `jfy_lang` cookie, so the
 * server's render is already in the visitor's language; see
 * lib/explore-i18n for how it stays in step with localStorage.
 */

import { cookies } from "next/headers";

import ExploreHeader from "@/components/explore/ExploreHeader";
import ExploreProviders from "@/components/explore/ExploreProviders";
import SiteFooter from "@/components/ds/SiteFooter";
import { getCurrentUser } from "@/lib/auth";
import { LANG_COOKIE } from "@/lib/explore-i18n/constants";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const saved = cookies().get(LANG_COOKIE)?.value;
  const lang = isLocale(saved) ? saved : "en";
  const user = await getCurrentUser().catch(() => null);

  return (
    <ExploreProviders initialLang={lang} signedIn={user !== null}>
      <ExploreHeader user={user ? { name: user.name, email: user.email } : null} />
      <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6">{children}</main>
      <SiteFooter locale={lang} />
    </ExploreProviders>
  );
}
