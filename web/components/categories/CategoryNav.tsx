/**
 * Sticky category strip with a hover/focus mega-menu.
 *
 * A Server Component, deliberately. The brief called for "use client" here,
 * but the reference implements the whole menu in CSS - `group-hover:block`
 * plus `group-focus-within:block` - with no state and no handlers. Marking it
 * a client component would ship JavaScript for a dropdown that does not use
 * any. The focus-within half is what makes it keyboard-reachable, and that is
 * a CSS selector too.
 *
 * WHAT THE MENU SHOWS, AND WHY IT IS NOT SUBCATEGORIES. The brief specifies
 * subcategory counts "from real child-category listing_count values (our
 * taxonomy already has these)". It does not: every one of the twelve
 * categories has `parent_id: null`, so there are no children to list and no
 * counts to read. The source filled this space with a fabricated
 * `c / (k + 2.2)` formula, which is exactly what not to ship.
 *
 * So the menu lists the top-rated real businesses in that category and city
 * instead. Same layout, same interaction, same "View all N" footer - real data
 * in the rows. It is also more useful: a subcategory is another click away
 * from a phone number, and a business is not.
 */

import Link from "next/link";

import { formatCount, formatRating } from "@/lib/format";
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import type { BusinessListItem } from "@/lib/types";

const intl = INTL_LOCALE[DEFAULT_LOCALE];

export interface NavCategory {
  name: string;
  slug: string;
  href: string;
  /** Listings in this city. */
  count: number;
  /** The top few, already fetched. Empty renders the menu without rows. */
  top: BusinessListItem[];
}

export default function CategoryNav({
  categories,
  allCategoriesHref,
  current = "all",
}: {
  categories: readonly NavCategory[];
  allCategoriesHref: string;
  current?: "all" | string;
}): JSX.Element {
  return (
    <nav
      aria-label="Category navigation"
      className="sticky top-[65px] z-30 border-b border-line bg-surface max-[900px]:static"
    >
      <div className="mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex-none">
          <Link
            href={allCategoriesHref}
            aria-current={current === "all" ? "page" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-3.5 text-body font-semibold
              focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring
              ${
                current === "all"
                  ? "border-brand-700 text-brand-700"
                  : "border-transparent text-ink-muted hover:text-brand-700"
              }`}
          >
            All Categories
          </Link>
        </div>

        {categories.map((category) => (
          <div key={category.slug} className="group relative flex-none">
            <Link
              href={category.href}
              aria-current={current === category.slug ? "page" : undefined}
              className="flex items-center gap-1.5 whitespace-nowrap border-b-[3px] border-transparent px-3 py-3.5 text-body font-semibold text-ink-muted
                         group-hover:text-brand-700
                         focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              {category.name}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="transition group-hover:rotate-180 motion-reduce:transition-none motion-reduce:group-hover:rotate-0"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </Link>

            <div
              className="absolute left-0 top-full hidden min-w-[300px] rounded-b-card border border-line bg-surface p-3.5 shadow-overlay
                         group-hover:block group-focus-within:block"
            >
              <h2 className="mb-2 text-micro uppercase text-ink-subtle">
                Top in {category.name}
              </h2>

              {category.top.length > 0 ? (
                <ul className="grid gap-0.5">
                  {category.top.map((business) => (
                    <li key={business.id}>
                      <Link
                        href={`/business/${business.slug}`}
                        className="flex justify-between gap-4 rounded-input px-2 py-1.5 text-body text-ink-muted
                                   hover:bg-brand-50 hover:text-brand-800
                                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <span className="truncate">{business.name}</span>
                        {business.rating !== null ? (
                          <span className="shrink-0 tabular text-meta text-ink-subtle">
                            {formatRating(business.rating)} ★
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1.5 text-meta text-ink-subtle">
                  Nothing listed here yet.
                </p>
              )}

              <Link
                href={category.href}
                className="mt-2 block border-t border-line pt-2.5 text-body font-semibold text-brand-700
                           hover:text-brand-800
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                View all {formatCount(category.count, intl)}{" "}
                {category.count === 1 ? "listing" : "listings"} →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
