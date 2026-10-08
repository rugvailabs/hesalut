/**
 * Root layout: fonts, the page ground, and the theme (lib/theme.ts).
 *
 * Inter through next/font, which self-hosts the file and emits it as a CSS
 * variable - no network request to Google on first paint, and no layout shift
 * when it lands. tailwind.config.ts reads that variable, so `font-sans` is
 * Inter everywhere without a single component naming the typeface.
 *
 * The top bar (ExploreHeader) is rendered here, once, so every page has the
 * same one - pages must not render a header of their own. Its language
 * switch comes from the `jfy_lang` cookie, so the server's render is already
 * in the visitor's language.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";

import ExploreHeader from "@/components/explore/ExploreHeader";
import { SiteProviders } from "@/components/explore/ExploreProviders";
import { getCurrentUser } from "@/lib/auth";
import { LANG_COOKIE } from "@/lib/explore-i18n/constants";
import { getNewLeads } from "@/lib/lead-notifications";
import { isLocale } from "@/lib/i18n";
import { indexingAllowed } from "@/lib/indexing";
import { THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "justforyou",
  description: "Find local businesses across Canada.",
  // Test deployments are kept out of search engines; see lib/indexing.ts.
  ...(indexingAllowed ? {} : { robots: { index: false, follow: false } }),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const saved = cookies().get(LANG_COOKIE)?.value;
  const lang = isLocale(saved) ? saved : "en";
  const user = await getCurrentUser().catch(() => null);
  // The bell is for owners; everyone else skips the extra request.
  const isOwner = user !== null && (user.is_admin || user.role === "admin" || user.role === "business_owner");
  const leads = isOwner ? await getNewLeads() : null;
  // One listing with something new: go straight to its leads. Several: the
  // dashboard, which says which.
  const withNew = leads?.businesses.filter((b) => b.new_leads > 0) ?? [];
  const newLeads =
    leads === null
      ? null
      : {
          count: leads.total_new,
          href: withNew.length === 1 ? `/dashboard/${withNew[0].business_id}/leads` : "/dashboard",
        };

  return (
    // suppressHydrationWarning: THEME_SCRIPT adds the `dark` class before
    // React hydrates, so <html>'s class legitimately differs from the server's.
    <html lang="en-CA" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- a constant, not user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <SiteProviders initialLang={lang} signedIn={user !== null}>
          <ExploreHeader
            user={
              user
                ? {
                    name: user.name,
                    email: user.email,
                    isAdmin: user.is_admin || user.role === "admin",
                    isOwner: user.is_admin || user.role === "admin" || user.role === "business_owner",
                  }
                : null
            }
            newLeads={newLeads}
          />
          {children}
        </SiteProviders>
      </body>
    </html>
  );
}
