/**
 * The shell every static content page uses.
 *
 * These pages are the one place in the app with long-form prose, and prose
 * needs a measure - a line length somewhere near 65 characters - which no
 * other layout here wants. Rather than let each page invent its own, the
 * width, the heading rhythm and the link treatment live once, here.
 *
 * `updated` is required rather than optional on purpose: a policy page with no
 * date on it tells the reader nothing about whether it still applies.
 */

import Link from "next/link";

import SiteFooter from "@/components/ds/SiteFooter";
import { Breadcrumbs } from "@/components/ds/feedback";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";


export default function Prose({
  title,
  lede,
  updated,
  children,
  className,
}: {
  title: string;
  lede?: string;
  /** ISO date this page's content last changed. */
  updated: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Breadcrumbs locale={locale} className="mb-4" items={[{ label: t("pages.prose.home"), href: "/" }, { label: title }]} />

        <h1 className="text-page-title text-ink">{title}</h1>
        {lede !== undefined ? (
          <p className="mt-2 max-w-prose text-body text-ink-muted">{lede}</p>
        ) : null}
        <p className="mt-2 text-meta text-ink-subtle">
          {t("pages.prose.lastUpdated", {
            date: formatDate(updated, INTL_LOCALE[locale]),
          })}
        </p>

        <div
          className={cn(
            "mt-8 max-w-prose space-y-4 text-body text-ink-muted",
            // Headings, lists and links, styled once for every content page.
            "[&_h2]:mt-8 [&_h2]:text-section-heading [&_h2]:text-ink",
            "[&_h3]:mt-6 [&_h3]:text-card-title [&_h3]:text-ink",
            "[&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
            "[&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
            "[&_a]:rounded-sm [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-4",
            "[&_a:hover]:text-brand-800",
            "[&_strong]:font-semibold [&_strong]:text-ink",
            className,
          )}
        >
          {children}
        </div>

        <p className="mt-10 border-t border-line pt-4 text-meta text-ink-subtle">
          {t("pages.prose.unclear")}{" "}
          <Link
            href="/contact"
            className="rounded-sm text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("pages.prose.tellUs")}
          </Link>
          .
        </p>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
