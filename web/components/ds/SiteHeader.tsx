/**
 * The site header: wordmark, What/Where search, language toggle, CTA, account.
 *
 * A Server Component, like the header it replaces - it reads the session
 * directly, so no page passes a user down and the nav costs no client JS. The
 * search box is the one interactive piece and is its own client island.
 *
 * The mark is the hesalut logo (public/logo.png), a transparent PNG; it is
 * inverted in dark mode so the black shape stays visible.
 */

import Link from "next/link";

import HeaderSearch from "@/components/ds/HeaderSearch";
import LogoutButton from "@/components/LogoutButton";
import { Button } from "@/components/ds/primitives";
import { getCurrentUser } from "@/lib/auth";
import { tFor, type Locale } from "@/lib/i18n";

function Wordmark(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/logo.png" alt="" aria-hidden="true" className="h-7 w-auto dark:invert" />
      <span className="text-card-title font-semibold tracking-tight text-ink">
        hesalut
      </span>
    </span>
  );
}

/**
 * EN | FR.
 *
 * Renders the pair with the inactive one as a real link. It points at the
 * current path with ?lang=, which nothing consumes yet - the dictionaries and
 * t() are in place, the routing is not - so the inactive side is marked
 * aria-disabled rather than pretending to switch the site over.
 */
function LanguageToggle({ locale }: { locale: Locale }): JSX.Element {
  const t = tFor(locale);
  return (
    <div
      className="inline-flex items-center rounded-pill border border-line text-micro"
      role="group"
      aria-label={t("common.language")}
    >
      {(["en", "fr"] as const).map((code) => {
        const active = code === locale;
        return (
          <span
            key={code}
            aria-current={active ? "true" : undefined}
            aria-disabled={active ? undefined : "true"}
            title={active ? undefined : "Coming soon"}
            className={
              active
                ? "rounded-pill bg-brand-600 px-2 py-1 text-ink-inverse"
                : "px-2 py-1 text-ink-faint"
            }
          >
            {code.toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

export default async function SiteHeader({
  locale = "en",
  /** Hide the search bar on pages that have their own, e.g. /search. */
  showSearch = true,
}: {
  locale?: Locale;
  showSearch?: boolean;
}): Promise<JSX.Element> {
  const t = tFor(locale);
  const user = await getCurrentUser();
  const isAdmin = user !== null && (user.is_admin || user.role === "admin");
  const isOwner = user !== null && (isAdmin || user.role === "business_owner");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={t("common.brand")}
        >
          <Wordmark />
        </Link>

        {showSearch ? (
          <div className="order-last w-full lg:order-none lg:mx-4 lg:w-auto lg:flex-1">
            <HeaderSearch locale={locale} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <nav className="flex items-center gap-2" aria-label={t("common.brand")}>
          <LanguageToggle locale={locale} />

          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/search">{t("common.browse")}</Link>
          </Button>

          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/explore">{t("common.explore")}</Link>
          </Button>

          {user === null ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href="/login">{t("common.signIn")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link href="/register">{t("common.listYourBusiness")}</Link>
              </Button>
            </>
          ) : (
            <>
              {isOwner ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard">{t("common.dashboard")}</Link>
                </Button>
              ) : null}
              {isAdmin ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">{t("common.admin")}</Link>
                </Button>
              ) : null}
              {!isOwner ? (
                // A customer can turn their account into a business account.
                <Button asChild size="sm" className="hidden md:inline-flex">
                  <Link href="/register">{t("common.listYourBusiness")}</Link>
                </Button>
              ) : null}
              <span className="hidden max-w-[12ch] truncate text-meta text-ink-subtle md:inline">
                {user.name}
              </span>
              <LogoutButton />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
