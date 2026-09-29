/**
 * One category card. Layout and interaction copied from the reference block;
 * only the colour and type tokens are ours.
 *
 * The parts worth keeping exactly, per the source's own notes:
 *   min-h-[186px] + justify-between  a two-line name never shifts the icon band
 *   one <a> around the whole card    the hit area is the card, not the title
 *   aria-label carries name + count  so a screen reader hears one useful link
 *   text-balance, no truncation      long names wrap instead of clipping
 *
 * The href is our real /[province]/[city]/[category] route, not the source's
 * /vancouver/{slug}.
 */

import Link from "next/link";

import CategoryIcon from "@/components/categories/CategoryIcon";
import { formatCount } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";

export default function CategoryCard({
  name,
  slug,
  count,
  href,
  cityLabel,
  locale = "en",
}: {
  /** Display name, already localized by the caller (lib/categories). */
  name: string;
  slug: string;
  count: number;
  href: string;
  cityLabel: string;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const shown = formatCount(count, intl);
  return (
    <Link
      href={href}
      id={slug}
      aria-label={t(
        count === 1 ? "discover.categories.cardAriaOne" : "discover.categories.cardAriaMany",
        { name, count: shown, city: cityLabel },
      )}
      className="group flex min-h-[186px] flex-col justify-between overflow-hidden rounded-card border border-line bg-surface transition
                 hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-overlay
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
                 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="px-3.5 pb-2.5 pt-3.5">
        <h3 className="mb-2 text-balance text-card-title leading-tight tracking-tight text-ink group-hover:text-brand-700">
          {name}
        </h3>
        <p className="text-meta tabular text-ink-subtle">
          {t(
            count === 1 ? "discover.categories.listingOne" : "discover.categories.listingMany",
            { count: shown },
          )}
        </p>
      </div>

      <div className="relative grid h-[74px] place-items-center border-t border-line bg-surface-muted text-brand-700">
        <CategoryIcon
          slug={slug}
          className="size-[34px] transition group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <span
          className="absolute bottom-2.5 right-2.5 grid size-6 place-items-center rounded-pill border border-line bg-surface text-ink-muted
                     transition group-hover:translate-x-0.5 group-hover:border-brand-700 group-hover:bg-brand-700 group-hover:text-ink-inverse
                     motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            aria-hidden="true"
          >
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
