/**
 * /[province]/[city]/all-categories - the browse page.
 *
 * A Server Component: it resolves the city, fetches the real taxonomy and the
 * per-city counts, and emits the JSON-LD. Only the filtering is client-side,
 * in AllCategoriesBrowser.
 *
 * THE COUNTS ARE PER CITY, and that is the whole reason this page does work
 * rather than rendering GET /categories straight out. `business_count` on that
 * endpoint is global - Plumbers reads 5 across Metro Vancouver but 3 in
 * Vancouver itself. A card that says 5 and leads to a page showing 3 is the
 * kind of small lie that makes a directory feel broken, so every count here is
 * the count on the page the card links to. It costs one search per category,
 * issued in parallel.
 *
 * Categories with no listings in this city are dropped rather than shown
 * greyed: a card is a promise that there is something behind it.
 *
 * The brief expected three populated categories; there are twelve. That is
 * worth stating because it changes the page - the chip row fills, and twelve
 * of twenty-six letters are live rather than three.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AllCategoriesBrowser, {
  type BrowseCategory,
} from "@/components/categories/AllCategoriesBrowser";
import CategoryNav, { type NavCategory } from "@/components/categories/CategoryNav";
import FooterQuickLinks from "@/components/categories/FooterQuickLinks";
import SiteFooter from "@/components/ds/SiteFooter";
import { getCategories, searchBusinesses } from "@/lib/api";
import { categoryName } from "@/lib/categories";
import {
  PROVINCES,
  cityFromSlug,
  formatCount,
  isProvinceCode,
} from "@/lib/format";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessListItem, Category } from "@/lib/types";

export const dynamic = "force-dynamic";


/** How many categories get a mega-menu in the strip. More than this scrolls. */
const NAV_LIMIT = 6;
/** Rows inside one mega-menu. */
const NAV_TOP_N = 3;
/** Chips above the grid. Fewer are shown if fewer categories are populated. */
const CHIP_LIMIT = 6;

interface Params {
  province: string;
  city: string;
}

interface Resolved {
  provinceCode: string;
  city: string;
  populated: BrowseCategory[];
}

/**
 * Province, city and per-city counts in one pass.
 *
 * Returns null for anything that is not real, which the page turns into a 404
 * - the same rule the city/category page follows, for the same reason: an
 * unbounded set of thin 200 pages is how a directory poisons its own index.
 */
async function resolve(params: Params): Promise<Resolved | null> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const provinceCode = params.province.toUpperCase();
  if (!isProvinceCode(provinceCode)) return null;

  const city = cityFromSlug(params.city);
  const categories = await getCategories().catch((): Category[] => []);
  if (categories.length === 0) return null;

  const counted = await Promise.all(
    categories.map(async (category) => {
      const result = await searchBusinesses({
        category_slug: category.slug,
        city,
        page_size: 1,
      }).catch(() => null);
      return { category, total: result?.total ?? 0 };
    }),
  );

  const populated: BrowseCategory[] = counted
    .filter((row) => row.total > 0)
    .map((row) => ({
      id: row.category.id,
      // Localized here, once, so the nav, grid, footer and JSON-LD all agree.
      name: categoryName(row.category.slug, row.category.name, locale),
      slug: row.category.slug,
      count: row.total,
      href: `/${params.province.toLowerCase()}/${params.city.toLowerCase()}/${row.category.slug}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, intl));

  // No categories here at all means the city itself is not real - the same
  // test the city/category page makes.
  if (populated.length === 0) return null;

  return { provinceCode, city, populated };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const t = tFor(getLocale());
  const resolved = await resolve(params);
  if (resolved === null) return { title: t("discover.city.notFound") };

  const { city, provinceCode, populated } = resolved;
  return {
    title: t("discover.categories.metaTitle", { city, province: provinceCode }),
    description: t("discover.categories.metaDescription", {
      count: populated.length,
      city,
      province: provinceCode,
    }),
  };
}

export default async function AllCategoriesPage({
  params,
}: {
  params: Params;
}): Promise<JSX.Element> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const t = tFor(locale);
  const resolved = await resolve(params);
  if (resolved === null) notFound();

  const { city, provinceCode, populated } = resolved;
  const provinceName =
    PROVINCES.find((p) => p.code === provinceCode)?.[locale] ?? provinceCode;

  const byCount = [...populated].sort((a, b) => b.count - a.count);
  const cityHome = `/${params.province.toLowerCase()}/${params.city.toLowerCase()}`;
  const allCategoriesHref = `${cityHome}/all-categories`;

  // Chips and nav are both "the busiest", chosen from real counts rather than
  // a hardcoded name list. Fewer than the limit simply renders fewer.
  const popularSlugs = byCount.slice(0, CHIP_LIMIT).map((c) => c.slug);

  const navSource = byCount.slice(0, NAV_LIMIT);
  const navCategories: NavCategory[] = await Promise.all(
    navSource.map(async (category) => {
      const result = await searchBusinesses({
        category_slug: category.slug,
        city,
        sort: "rating",
        page_size: NAV_TOP_N,
      }).catch(() => null);
      return {
        name: category.name,
        slug: category.slug,
        href: category.href,
        count: category.count,
        top: (result?.items ?? []) as BusinessListItem[],
      };
    }),
  );

  const totalListings = populated.reduce((sum, c) => sum + c.count, 0);

  // Both graphs come from the same resolved data the page renders, so they
  // cannot describe a page that is not what a crawler receives.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t("business.home"), item: "/" },
          { "@type": "ListItem", position: 2, name: `${city}, ${provinceCode}`, item: cityHome },
          {
            "@type": "ListItem",
            position: 3,
            name: t("discover.categories.heading"),
            item: allCategoriesHref,
          },
        ],
      },
      {
        "@type": "ItemList",
        name: t("discover.categories.itemListName", { city, province: provinceCode }),
        numberOfItems: populated.length,
        itemListElement: populated.map((category, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: category.name,
          item: category.href,
        })),
      },
    ],
  };

  return (
    <>
      <CategoryNav
        categories={navCategories}
        allCategoriesHref={allCategoriesHref}
        current="all"
        locale={locale}
      />

      <main className="pb-12 pt-7">
        <div className="mx-auto max-w-[1320px] px-5">
          <nav
            aria-label={t("discover.feedback.breadcrumb")}
            className="mb-2.5 text-micro uppercase text-ink-subtle"
          >
            <Link
              href="/"
              className="rounded-sm hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("business.home")}
            </Link>{" "}
            /{" "}
            <Link
              href={`/search?city=${encodeURIComponent(city)}`}
              className="rounded-sm hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {city}
            </Link>{" "}
            / {t("discover.categories.heading")}
          </nav>

          <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="mb-1.5 text-balance text-[clamp(26px,3.4vw,36px)] font-bold tracking-tight text-ink">
                {t("discover.categories.heading")}
              </h1>
              <p className="max-w-[62ch] text-body text-ink-muted">
                {t("discover.categories.intro", { city, province: provinceName })}
              </p>
            </div>
            <p className="whitespace-nowrap text-meta tabular text-ink-subtle">
              <b className="font-medium text-ink">{formatCount(populated.length, intl)}</b>{" "}
              {t("discover.categories.statCategories")} ·{" "}
              <b className="font-medium text-ink">{formatCount(totalListings, intl)}</b>{" "}
              {t("discover.categories.statListings")}
            </p>
          </div>

          <AllCategoriesBrowser
            categories={populated}
            cityLabel={city}
            popular={popularSlugs}
            locale={locale}
          />
        </div>

        <div className="mt-10">
          <FooterQuickLinks
            topCategories={byCount
              .slice(0, CHIP_LIMIT)
              .map((c) => ({ label: c.name, href: c.href }))}
            locale={locale}
          />
        </div>
      </main>

      <SiteFooter locale={locale} />

      <script
        type="application/ld+json"
        // Content is our own server-built object, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
