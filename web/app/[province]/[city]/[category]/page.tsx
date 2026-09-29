/**
 * /[province]/[city]/[category] - e.g. /bc/vancouver/restaurants
 *
 * Built because the hero cards link here. It is also the first piece of the
 * programmatic-SEO structure: a readable, linkable URL per city and trade,
 * which /search?category=x&city=y is not - a query string is not a page
 * anybody links to or a search engine treats as one.
 *
 * WHAT IS VALIDATED, AND WHY IT MATTERS. Every segment that can be enumerated
 * is checked, so this route cannot mint an unbounded set of thin 200 pages:
 *
 *   province  must be a real two-letter code (lib/format PROVINCES)
 *   category  must be a slug the API actually returns
 *   city      must have at least one listing in it
 *
 * The city check costs a second request, but only when the first came back
 * empty - which is what separates "no plumbers in Richmond yet" (a real page,
 * empty today) from "there is no city called Atlantis" (a 404). Returning 200
 * for the latter is how a directory ends up with a million indexed empty pages.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import TieredResults from "@/components/ds/TieredResults";
import SiteFooter from "@/components/ds/SiteFooter";
import { Breadcrumbs, EmptyState } from "@/components/ds/feedback";
import { Button } from "@/components/ds/primitives";
import { getCategories, searchBusinesses } from "@/lib/api";
import {
  PROVINCES,
  cityFromSlug,
  formatCount,
  isProvinceCode,
} from "@/lib/format";
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];
const PAGE_SIZE = 24;

interface Params {
  province: string;
  city: string;
  category: string;
}

/** Everything the page needs, or null when any segment is not real. */
async function resolve(params: Params): Promise<{
  category: Category;
  city: string;
  provinceCode: string;
  provinceName: string;
} | null> {
  const provinceCode = params.province.toUpperCase();
  if (!isProvinceCode(provinceCode)) return null;

  const categories = await getCategories().catch((): Category[] => []);
  const category = categories.find((c) => c.slug === params.category.toLowerCase());
  if (category === undefined) return null;

  const province = PROVINCES.find((p) => p.code === provinceCode);
  return {
    category,
    city: cityFromSlug(params.city),
    provinceCode,
    provinceName: province?.[locale] ?? provinceCode,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const resolved = await resolve(params);
  if (resolved === null) return { title: "Not found" };

  const { category, city, provinceCode } = resolved;
  return {
    title: `${category.name} in ${city}, ${provinceCode}`,
    description:
      `Find ${category.name.toLowerCase()} in ${city}, ${provinceCode}. ` +
      "Compare ratings, read reviews and contact businesses directly. " +
      "Every listing has had its identity checked.",
  };
}

export default async function CityCategoryPage({
  params,
}: {
  params: Params;
}): Promise<JSX.Element> {
  const resolved = await resolve(params);
  if (resolved === null) notFound();

  const { category, city, provinceCode } = resolved;

  const results = await searchBusinesses({
    category_slug: category.slug,
    city,
    page_size: PAGE_SIZE,
  }).catch(() => null);

  // Empty could mean "nothing in this trade here yet" or "this is not a city".
  // Only the second is a 404, and telling them apart costs a request we make
  // only in the case that is already empty.
  if (results === null || results.total === 0) {
    // An existence check nobody sees, so not logged as an impression.
    const anyHere = await searchBusinesses({ city, page_size: 1, track: false }).catch(() => null);
    if (anyHere === null || anyHere.total === 0) notFound();
  }

  const items = results?.items ?? [];
  const total = results?.total ?? 0;

  return (
    <>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: category.name, href: `/search?category=${category.slug}` },
            { label: `${city}, ${provinceCode}` },
          ]}
        />

        <h1 className="text-page-title text-ink">
          {category.name} in {city}
        </h1>
        <p className="mt-1 text-body text-ink-muted">
          {total > 0
            ? `${formatCount(total, intl)} ${total === 1 ? "listing" : "listings"}, each with its identity checked.`
            : `No ${category.name.toLowerCase()} listed in ${city} yet.`}
        </p>

        {items.length === 0 ? (
          <EmptyState
            className="mt-6"
            title={`Nothing here yet`}
            body={`No ${category.name.toLowerCase()} have been listed in ${city}. Try a wider search, or list yours.`}
            action={{ label: "Search everywhere", href: `/search?category=${category.slug}` }}
          />
        ) : (
          <>
            <TieredResults
              items={items}
              searchId={results?.search_id}
              locale={locale}
              className="mt-6"
            />

            {total > items.length ? (
              <div className="mt-6">
                <Button asChild variant="secondary">
                  <Link
                    href={`/search?category=${category.slug}&city=${encodeURIComponent(city)}`}
                  >
                    See all {formatCount(total, intl)} with filters
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
