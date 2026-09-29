/**
 * /search - results for whatever the query string says.
 *
 * searchParams is the only input: filters, sort, geo point and page all come
 * from the URL, so a result set is shareable and the back button behaves. The
 * parsing below is unchanged from Step 2 - it guards the same rules the API
 * enforces, so a stale ?sort=distance in a shared link degrades instead of
 * 422-ing.
 *
 * The layout is three columns on a wide screen: filters, results, map. The map
 * is last in the DOM as well as on the right, so a screen reader and a
 * keyboard reach the results first - it is a supplement to the list, not the
 * subject of the page.
 *
 * There is no sponsored slot. The design calls for one and maps it to an
 * `is_featured` field; no such column exists on businesses and nothing in the
 * API returns one, so there is nothing to promote and no honest way to fill it.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { LocateFixed, MapPin } from "lucide-react";

import ResultsMap from "@/components/ds/ResultsMap";
import NearMeLocator from "@/components/ds/NearMeLocator";
import TieredResults from "@/components/ds/TieredResults";
import SearchFilterRail from "@/components/ds/SearchFilterRail";
import SiteFooter from "@/components/ds/SiteFooter";
import SiteHeader from "@/components/ds/SiteHeader";
import { Alert, Breadcrumbs, EmptyState } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { ApiError, getCategories, searchBusinesses } from "@/lib/api";
import { formatCount, formatDistance } from "@/lib/format";
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import { splitNearMe } from "@/lib/near-me";
import type {
  BusinessSearchParams,
  BusinessSort,
  Category,
  SearchResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];

/**
 * Title and description come from the filters actually applied, so a shared
 * search link says what it shows rather than "Search" on every variation.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: RawParams;
}): Promise<Metadata> {
  const params = toSearchParams(searchParams);

  let subject = "Local businesses";
  if (params.category_slug) {
    const categories = await getCategories().catch(() => []);
    const match = categories.find((c) => c.slug === params.category_slug);
    subject = match?.name ?? params.category_slug;
  }
  if (params.q) subject = `${params.q}`;

  const where =
    params.lat !== undefined || wantsNearMe(searchParams)
      ? "near you"
      : `in ${params.city ?? "Metro Vancouver"}`;
  const title = `${subject} ${where}`;

  return {
    title,
    description:
      `Find ${subject.toLowerCase()} ${where}. ` +
      "Compare ratings, read reviews and contact businesses directly.",
  };
}

const PAGE_SIZE = 12;

const SORTS: BusinessSort[] = [
  "relevance",
  "rating",
  "reviews",
  "distance",
  "name",
  "newest",
];

type RawParams = Record<string, string | string[] | undefined>;

/** First value only: ?city=a&city=b must not become an array. */
function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

function num(value: string | string[] | undefined): number | undefined {
  const raw = one(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  // Reject NaN/Infinity here rather than sending garbage the API will 422 on.
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Whether the person asked for results near them - by `near=me` from a button,
 * or by typing the phrase ("plumber near me") into the query.
 */
function wantsNearMe(raw: RawParams): boolean {
  return one(raw.near) === "me" || splitNearMe(one(raw.q)).nearMe;
}

/** This page filters on one category and one city at a time. */
type SingleSearchParams = BusinessSearchParams & { category_slug?: string; city?: string };

/** Translate the URL into API params, dropping anything malformed. */
function toSearchParams(raw: RawParams): SingleSearchParams {
  const lat = num(raw.lat);
  const lng = num(raw.lng);
  // The API rejects a half-supplied point, so only forward a complete one.
  const hasPoint = lat !== undefined && lng !== undefined;

  const sortRaw = one(raw.sort);
  let sort = SORTS.includes(sortRaw as BusinessSort)
    ? (sortRaw as BusinessSort)
    : undefined;
  // Guard the same rule the API enforces, so a stale ?sort=distance in a
  // shared link degrades instead of 422-ing.
  if (sort === "distance" && !hasPoint) sort = undefined;

  const page = num(raw.page);

  return {
    // "near me" is an intent, not text to match against listing names.
    q: splitNearMe(one(raw.q)).query,
    category_slug: one(raw.category),
    city: one(raw.city),
    lat: hasPoint ? lat : undefined,
    lng: hasPoint ? lng : undefined,
    radius_km: hasPoint ? num(raw.radius_km) : undefined,
    min_rating: num(raw.min_rating),
    sort,
    page: page !== undefined && page >= 1 ? Math.floor(page) : 1,
    page_size: PAGE_SIZE,
  };
}

/** The same search in another city, without the location that found nothing. */
function areaUrl(raw: RawParams, city: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const single = one(v);
    if (single === undefined) continue;
    if (["city", "lat", "lng", "radius_km", "near", "page", "sort"].includes(k)) continue;
    params.set(k, single);
  }
  params.set("city", city);
  return `/search?${params.toString()}`;
}

/** Rebuild the current URL with one parameter changed. */
function urlWith(raw: RawParams, key: string, value: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const single = one(v);
    if (single !== undefined) params.set(k, single);
  }
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: RawParams;
}): Promise<JSX.Element> {
  const params = toSearchParams(searchParams);
  const hasPoint = params.lat !== undefined && params.lng !== undefined;

  // Near me was asked for but the browser has not supplied a position yet:
  // show the locator instead of running a search that ignores the request.
  const locating = wantsNearMe(searchParams) && !hasPoint;

  const [categoriesResult, resultsResult] = await Promise.allSettled([
    getCategories(),
    locating ? Promise.resolve(null) : searchBusinesses(params),
  ]);

  const categories: Category[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value : [];

  const failed = resultsResult.status === "rejected";
  let results: SearchResponse | null = failed
    ? null
    : (resultsResult as PromiseFulfilledResult<SearchResponse | null>).value;

  // Nothing within the radius. Rather than an empty page, show the closest
  // matches at any distance and say plainly that that is what they are.
  let widened = false;
  if (results !== null && results.total === 0 && hasPoint && params.radius_km !== undefined) {
    const wider = await searchBusinesses({
      ...params,
      radius_km: undefined,
      sort: "distance",
    }).catch(() => null);
    if (wider !== null && wider.total > 0) {
      results = wider;
      widened = true;
    }
  }

  // Still nothing (a city with none of these, or nothing anywhere near): look
  // for other areas that do have them, so the page offers somewhere to go.
  // Not logged as impressions - nobody is shown these listings.
  let otherAreas: string[] = [];
  if (results !== null && results.total === 0 && (params.city !== undefined || hasPoint)) {
    const anywhere = await searchBusinesses({
      q: params.q,
      category_slug: params.category_slug,
      min_rating: params.min_rating,
      page_size: 50,
      track: false,
    }).catch(() => null);
    const counts = new Map<string, number>();
    for (const item of anywhere?.items ?? []) {
      if (item.city.toLowerCase() === params.city?.toLowerCase()) continue;
      counts.set(item.city, (counts.get(item.city) ?? 0) + 1);
    }
    otherAreas = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([city]) => city);
  }

  const errorMessage = failed
    ? resultsResult.reason instanceof ApiError
      ? resultsResult.reason.isNetworkError
        ? "The API is not reachable. Is the backend running on port 8000?"
        : resultsResult.reason.message
      : "Something went wrong running that search."
    : null;

  const page = results?.page ?? params.page ?? 1;
  const categoryName = categories.find((c) => c.slug === params.category_slug)?.name;

  // The h1 states what was actually searched, so a shared link reads as its
  // own page rather than as "Search" with different contents.
  const subject = params.q ?? categoryName ?? "Local businesses";
  const where =
    hasPoint || locating ? "near you" : `in ${params.city ?? "Metro Vancouver"}`;

  // What the locator carries forward: every filter except the location ones,
  // with the query already cleaned of its "near me" phrase.
  const locatorParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    const single = one(value);
    if (single === undefined) continue;
    if (["near", "lat", "lng", "radius_km", "sort", "page", "q"].includes(key)) continue;
    locatorParams[key] = single;
  }
  if (params.q !== undefined) locatorParams.q = params.q;

  const items = results?.items ?? [];
  // Results are ordered by plan tier first, so the nearest is not
  // necessarily the first card.
  const distances = items
    .map((item) => item.distance_km)
    .filter((km): km is number => km !== null);
  const nearestKm = distances.length > 0 ? Math.min(...distances) : null;
  const mappable = items.filter(
    (business) => business.latitude !== null && business.longitude !== null,
  ).length;

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Breadcrumbs
          items={[
            // The Browse page opens without a Home link, as asked; it stays
            // in the markup, hidden.
            { label: "Home", href: "/", hidden: true },
            { label: "Search", href: "/search" },
            ...(categoryName !== undefined ? [{ label: categoryName }] : []),
          ]}
        />

        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-page-title text-ink">
              {subject} {where}
            </h1>
            {results !== null ? (
              <p className="mt-1 text-body text-ink-muted">
                <span className="tabular">{formatCount(results.total, intl)}</span>{" "}
                {results.total === 1 ? "listing" : "listings"}
                {hasPoint && !widened ? ` within ${params.radius_km ?? 25} km` : ""}
                {results.total_pages > 1
                  ? ` · page ${results.page} of ${results.total_pages}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
          {/* ------------------------------------------------------ filters */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SearchFilterRail categories={categories} locale={locale} />
          </aside>

          {/* ------------------------------------------------------ results */}
          <div className="min-w-0">
            {widened ? (
              <Alert tone="info" className="mb-4">
                Nothing matches within {params.radius_km} km of you, so these are the
                closest matches instead
                {nearestKm !== null && page === 1
                  ? ` - the nearest is ${formatDistance(nearestKm, intl)} away`
                  : ""}
                .
              </Alert>
            ) : null}

            {locating ? (
              <NearMeLocator query={params.q} baseParams={locatorParams} />
            ) : errorMessage !== null ? (
              <Card className="border-danger/30 bg-danger-bg p-5">
                <h2 className="text-card-title text-danger">Search failed</h2>
                <p className="mt-1 text-body text-danger">{errorMessage}</p>
                <div className="mt-3">
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/search">Reset search</Link>
                  </Button>
                </div>
              </Card>
            ) : results !== null && results.total === 0 ? (
              <>
                <EmptyState
                  title={
                    params.city !== undefined || hasPoint
                      ? "No services in this area"
                      : "No listings match that"
                  }
                  body="Try a broader search - remove the city, lower the minimum rating, or widen the category."
                  action={{ label: "Clear all filters", href: "/search" }}
                />
                {otherAreas.length > 0 ? (
                  <div className="mt-4">
                    <h2 className="text-card-title text-ink">Other areas with {subject.toLowerCase()}</h2>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {otherAreas.map((area) => (
                        <li key={area}>
                          <Button asChild variant="secondary" size="sm">
                            <Link href={areaUrl(searchParams, area)}>{area}</Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <TieredResults items={items} searchId={results?.search_id} locale={locale} />

                {results !== null && results.total_pages > 1 ? (
                  <nav
                    aria-label="Pagination"
                    className="mt-6 flex items-center justify-between gap-3"
                  >
                    {results.has_prev ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={urlWith(searchParams, "page", String(page - 1))}>
                          ← Previous
                        </Link>
                      </Button>
                    ) : (
                      <span />
                    )}

                    <span className="text-meta tabular text-ink-subtle">
                      Page {results.page} of {results.total_pages}
                    </span>

                    {results.has_next ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={urlWith(searchParams, "page", String(page + 1))}>
                          Next →
                        </Link>
                      </Button>
                    ) : (
                      <span />
                    )}
                  </nav>
                ) : null}
              </>
            )}
          </div>

          {/* ---------------------------------------------------------- map */}
          <aside className="hidden xl:block">
            <div className="sticky top-20 overflow-hidden rounded-card border border-line bg-surface shadow-raised">
              <div className="h-[28rem]">
                {mappable > 0 ? (
                  <ResultsMap
                    businesses={items}
                    origin={
                      hasPoint
                        ? { lat: params.lat as number, lng: params.lng as number }
                        : undefined
                    }
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-muted px-6 text-center">
                    {locating ? (
                      <LocateFixed className="size-5 text-ink-faint" aria-hidden="true" />
                    ) : (
                      <MapPin className="size-5 text-ink-faint" aria-hidden="true" />
                    )}
                    <p className="text-meta text-ink-muted">
                      {locating
                        ? "The map appears once your location is found."
                        : "No results on this page have coordinates yet."}
                    </p>
                  </div>
                )}
              </div>
              {mappable > 0 ? (
                <p className="border-t border-line px-3 py-2 text-meta text-ink-subtle">
                  <span className="tabular">{mappable}</span> of{" "}
                  <span className="tabular">{items.length}</span> on this page are
                  mapped.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
