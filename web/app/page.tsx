/**
 * Home: hero search, categories, top-rated listings, owner CTA.
 *
 * A Server Component, which is not a preference - the backend ships no CORS
 * middleware, so the browser cannot call it directly and the fetching has to
 * happen here.
 *
 * The data calls are exactly the ones Step 2 established: getCategories() and
 * searchBusinesses(). What changed is the composition and that every panel is
 * settled independently, so a slow or failing query costs its own section
 * rather than the page.
 *
 * Every number on this page is real. The counts in the trust strip are summed
 * from the category counts the API returns, and "identity checked" is a fact
 * about this directory rather than marketing: search joins on verified KYC, so
 * a listing cannot appear here without having passed it.
 */

import Link from "next/link";
import { BadgeCheck, ArrowRight, Star } from "lucide-react";

import HeroBanner from "@/components/HeroBanner/HeroBanner";
import TravelTiles from "@/components/HeroBanner/TravelTiles";
import HeroSearch from "@/components/ds/HeroSearch";
import ListingCard from "@/components/ds/ListingCard";
import PlacementNote from "@/components/ds/PlacementNote";
import SiteFooter from "@/components/ds/SiteFooter";
import { EmptyState } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { ApiError, getCategories, searchBusinesses } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessListItem, Category } from "@/lib/types";

// Reads the session (for the header) and live counts.
export const dynamic = "force-dynamic";


function describe(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isNetworkError
      ? "The API is not reachable. Is the backend running on port 8000?"
      : error.message;
  }
  return "Something went wrong.";
}

export default async function HomePage(): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];

  // Settled independently: one failing panel must not blank the page.
  const [categoriesResult, topRatedResult] = await Promise.allSettled([
    getCategories(),
    searchBusinesses({ sort: "rating", min_rating: 4.5, page_size: 6 }),
  ]);

  const categories: Category[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
  const topRated: BusinessListItem[] =
    topRatedResult.status === "fulfilled" ? topRatedResult.value.items : [];
  const topRatedSearchId =
    topRatedResult.status === "fulfilled" ? topRatedResult.value.search_id : null;

  const categoriesError =
    categoriesResult.status === "rejected" ? describe(categoriesResult.reason) : null;

  const listingTotal = categories.reduce(
    (total, category) => total + category.business_count,
    0,
  );
  // The busiest few, for the "popular" row under the search box.
  const popular = [...categories]
    .sort((a, b) => b.business_count - a.business_count)
    .slice(0, 5);

  return (
    <>
      {/* The hero carries the search, so the header does not repeat it. */}

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="border-b border-line bg-gradient-to-b from-brand-50 to-canvas">
          <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20">
            <h1 className="text-balance text-[2rem] font-bold leading-[1.15] tracking-tight text-ink sm:text-[2.5rem]">
              Find local businesses across Metro Vancouver
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-[0.9375rem] leading-relaxed text-ink-muted">
              Every listing here has had its identity checked before it appears.
              Search by trade, filter by city and rating, or find what is
              closest to you.
            </p>

            <div className="mt-7 text-left">
              <HeroSearch locale={locale} />
            </div>

            {popular.length > 0 ? (
              <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-meta text-ink-subtle">
                <span>Popular:</span>
                {popular.map((category, index) => (
                  <span key={category.id}>
                    <Link
                      href={`/search?category=${encodeURIComponent(category.slug)}`}
                      className="rounded-sm text-ink-muted underline-offset-2 hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {category.name}
                    </Link>
                    {index < popular.length - 1 ? (
                      <span aria-hidden="true"> &middot;</span>
                    ) : null}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </section>

        {/* --------------------------------------------------- hero banner */}
        <HeroBanner />

        {/* -------------------------------------------------- travel tiles */}
        <TravelTiles />

        {/* ------------------------------------------------------ trust strip */}
        {listingTotal > 0 ? (
          <section className="border-b border-line bg-surface">
            <div className="mx-auto grid max-w-6xl gap-px bg-line px-0 sm:grid-cols-3">
              {[
                {
                  value: formatCount(listingTotal, intl),
                  label: "listings in the directory",
                },
                {
                  value: formatCount(categories.length, intl),
                  label: "categories to browse",
                },
                { value: "100%", label: "identity checked before listing" },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-6 py-5 text-center">
                  <p className="text-section-heading tabular text-brand-800">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-meta text-ink-subtle">{stat.label}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* -------------------------------------------------------- categories */}
        <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section-heading text-ink">Browse by category</h2>
            <Link
              href="/search"
              className="inline-flex items-center gap-1 rounded-sm text-body text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              See all listings
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {categoriesError !== null ? (
            <Card className="border-warning/30 bg-warning-bg p-4">
              <p className="text-body text-warning">
                Categories are unavailable right now. {categoriesError}
              </p>
            </Card>
          ) : categories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              body="Seed the backend with python -m scripts.seed to populate the directory."
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/search?category=${encodeURIComponent(category.slug)}`}
                    className="flex h-full flex-col items-center gap-1 rounded-card border border-line bg-surface p-5 text-center shadow-raised transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span aria-hidden="true" className="text-2xl">
                      {category.icon ?? "•"}
                    </span>
                    <span className="mt-1 text-body font-medium text-ink">
                      {category.name}
                    </span>
                    <span className="text-meta tabular text-ink-subtle">
                      {formatCount(category.business_count, intl)}{" "}
                      {category.business_count === 1 ? "listing" : "listings"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------------- top rated */}
        {topRated.length > 0 ? (
          <section className="border-y border-line bg-surface-muted">
            <div className="mx-auto max-w-6xl px-4 py-section sm:px-6">
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-section-heading text-ink">
                    <Star className="size-5 fill-rating text-rating" aria-hidden="true" />
                    Top rated right now
                  </h2>
                  <p className="mt-1 text-meta text-ink-subtle">
                    Rated 4.5 and above by customers who used them.
                  </p>
                </div>
                <Link
                  href="/search?sort=rating"
                  className="inline-flex items-center gap-1 rounded-sm text-body text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  See all
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              <PlacementNote items={topRated} locale={locale} className="mb-3" />
              <div className="grid gap-3 lg:grid-cols-2">
                {topRated.map((business) => (
                  <ListingCard
                    key={business.id}
                    business={business}
                    searchId={topRatedSearchId}
                    locale={locale}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* -------------------------------------------------------- owner CTA */}
        <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
          <Card className="flex flex-col items-start gap-4 border-brand-200 bg-brand-50 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <h2 className="flex items-center gap-2 text-section-heading text-ink">
                <BadgeCheck className="size-5 text-verified" aria-hidden="true" />
                Run a business in Metro Vancouver?
              </h2>
              <p className="mt-1 text-body text-ink-muted">
                Add your listing free. A moderator reviews it and we verify the
                business behind it, then customers can find you, call you and
                message you here.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/register">{t("common.listYourBusiness")}</Link>
            </Button>
          </Card>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
