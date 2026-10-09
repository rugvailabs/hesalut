/**
 * Site footer.
 *
 * Only links to routes that exist. A footer full of dead "About / Careers /
 * Press" links is the fastest way to make a product feel like a template, and
 * every one of them is a 404 somebody has to explain later.
 *
 * That rule is why there is no Advertise or Pricing link: /plans has backend
 * endpoints and two seeded rows but no page, so linking it would be advertising
 * a route that 404s. It goes in when the page does.
 *
 * "Free listing" and "Add your business" are the same flow under the two names
 * people search for, which is deliberate - not an accident of copy-paste.
 */

import Link from "next/link";

import { tFor, type Locale } from "@/lib/i18n";

export default function SiteFooter({
  locale = "en",
}: {
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const year = new Date().getFullYear();

  const columns: { heading: string; links: { href: string; label: string }[] }[] = [
    {
      heading: t("footer.forCustomers"),
      links: [
        { href: "/search", label: t("footer.browseCategories") },
        { href: "/about", label: t("footer.about") },
      ],
    },
    {
      heading: t("footer.forBusinesses"),
      links: [
        // Both go to registration, which sends an owner who has already
        // registered on to adding another listing.
        { href: "/register", label: t("footer.addListing") },
        { href: "/register", label: t("footer.freeListing") },
        { href: "/dashboard", label: t("footer.ownerSignIn") },
      ],
    },
    {
      heading: t("footer.support"),
      links: [
        { href: "/contact", label: t("footer.contact") },
        { href: "/contact?kind=feedback", label: t("footer.feedback") },
        { href: "/contact?kind=bug", label: t("footer.reportBug") },
      ],
    },
    {
      heading: t("footer.legal"),
      links: [
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/terms", label: t("footer.terms") },
      ],
    },
  ];

  return (
    <footer className="mt-section border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap gap-x-10 gap-y-8">
          <div className="min-w-[16rem] flex-1">
            <p className="text-card-title font-semibold text-ink">
              hesalut
            </p>
            <p className="mt-1 max-w-sm text-meta text-ink-subtle">
              {t("common.tagline")}
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-micro uppercase text-ink-subtle">{column.heading}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-body text-ink-muted hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-6 text-meta text-ink-subtle">
          <p>
            &copy; {year} hesalut. {t("footer.rights")}
          </p>
          <p>{t("footer.madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
