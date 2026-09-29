/**
 * The /explore pages' selection: what the visitor searched for on
 * /explore and narrowed on /explore/results.
 *
 * One shape, four serialisations, all here so they cannot drift:
 *   - the store (components/explore/state.tsx) holds it
 *   - sessionStorage keeps it across reloads and back-navigation
 *   - the results URL carries it, so a results link can be shared
 *   - the search API receives it as repeated query parameters
 *
 * Within a facet the choices are alternatives - two categories means either
 * one. Hours are requirements - "open now" and "weekends" means both.
 */

import type { BusinessSort } from "@/lib/types";

export type ExploreSort = Extract<
  BusinessSort,
  "relevance" | "rating" | "reviews" | "distance" | "newest" | "price"
>;
export type PriceLevel = "$" | "$$" | "$$$" | "$$$$";
export type RatingBand = "5" | "4.5" | "4" | "3";
export type HoursOption = "open_now" | "weekends" | "evenings";
export type RadiusFilter = "5" | "10" | "25" | "50" | "100" | "any";

export interface Point {
  lat: number;
  lng: number;
}

export interface ExploreSelection {
  categories: string[];
  cities: string[];
  postal: string;
  /** The visitor's position, when they chose "near me". */
  near: Point | null;
  radius: RadiusFilter;
  ratings: RatingBand[];
  hours: HoursOption[];
  prices: PriceLevel[];
  q: string;
  sort: ExploreSort;
}

export const EMPTY_SELECTION: ExploreSelection = {
  categories: [],
  cities: [],
  postal: "",
  near: null,
  radius: "25",
  ratings: [],
  hours: [],
  prices: [],
  q: "",
  sort: "relevance",
};

export const SORTS: ExploreSort[] = ["relevance", "rating", "reviews", "distance", "price", "newest"];
export const PRICE_LEVELS: PriceLevel[] = ["$", "$$", "$$$", "$$$$"];
export const RATING_BANDS: RatingBand[] = ["5", "4.5", "4", "3"];
export const HOURS_OPTIONS: HoursOption[] = ["open_now", "weekends", "evenings"];
export const RADII: RadiusFilter[] = ["5", "10", "25", "50", "100", "any"];

export const PAGE_SIZE = 12;

/* ------------------------------------------------------------- postal */

const POSTAL_PREFIX = /^[A-Za-z]\d[A-Za-z](?:\s?\d(?:[A-Za-z]\d?)?)?$/;

export function looksLikePostal(value: string): boolean {
  return POSTAL_PREFIX.test(value.trim());
}

/** "v6b5p2" -> "V6B 5P2", "v6b" -> "V6B". */
export function normalisePostal(value: string): string {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact.length > 3 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
}

/* ------------------------------------------------------- normalising */

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * The rules that tie fields together, applied on every change:
 *   - distance sorting needs a position
 *   - "near me" and named places are alternatives, not a combination
 *     (a radius around you intersected with Surrey is rarely what anyone
 *     meant); the most recent choice wins, in the reducer
 */
export function normalise(s: ExploreSelection): ExploreSelection {
  const next: ExploreSelection = {
    ...s,
    categories: unique(s.categories),
    cities: unique(s.cities),
    ratings: unique(s.ratings).filter((r) => RATING_BANDS.includes(r)),
    hours: unique(s.hours).filter((h) => HOURS_OPTIONS.includes(h)),
    prices: unique(s.prices ?? []).filter((p) => PRICE_LEVELS.includes(p)),
    postal: looksLikePostal(s.postal) ? normalisePostal(s.postal) : s.postal.trim() ? s.postal : "",
    q: s.q.slice(0, 128),
  };
  if (next.sort === "distance" && next.near === null) next.sort = "relevance";
  return next;
}

/** How many choices are active - the badge on "Clear all". */
export function countActive(s: ExploreSelection): number {
  return (
    s.categories.length +
    s.cities.length +
    s.ratings.length +
    s.hours.length +
    s.prices.length +
    (s.postal ? 1 : 0) +
    (s.near ? 1 : 0) +
    (s.q.trim() ? 1 : 0)
  );
}

/* ----------------------------------------------------- page URL (step 2) */

/** The results page's own query string. Only what differs from empty. */
export function toPageQuery(s: ExploreSelection): string {
  const qs = new URLSearchParams();
  for (const c of s.categories) qs.append("category", c);
  for (const c of s.cities) qs.append("city", c);
  if (s.postal && looksLikePostal(s.postal)) qs.set("postal", normalisePostal(s.postal));
  if (s.near) {
    // ~100 m is plenty, and a shared link does not carry an exact position.
    qs.set("lat", s.near.lat.toFixed(3));
    qs.set("lng", s.near.lng.toFixed(3));
    if (s.radius !== "25") qs.set("radius", s.radius);
  }
  for (const r of s.ratings) qs.append("rating", r);
  for (const h of s.hours) qs.append("hours", h);
  for (const p of s.prices) qs.append("price", p);
  if (s.q.trim()) qs.set("q", s.q.trim());
  if (s.sort !== "relevance") qs.set("sort", s.sort);
  return qs.toString();
}

const PAGE_KEYS = ["category", "city", "postal", "lat", "rating", "hours", "price", "q", "sort"];

export function hasSelectionParams(params: URLSearchParams): boolean {
  return PAGE_KEYS.some((key) => params.has(key));
}

function coordinate(raw: string | null, limit: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** Read a results URL back into a selection, dropping anything malformed. */
export function fromPageQuery(params: URLSearchParams): ExploreSelection {
  const lat = coordinate(params.get("lat"), 90);
  const lng = coordinate(params.get("lng"), 180);
  const radius = params.get("radius") as RadiusFilter | null;
  const sort = params.get("sort") as ExploreSort | null;
  const postal = params.get("postal") ?? "";

  return normalise({
    categories: params.getAll("category").filter(Boolean).slice(0, 50),
    cities: params.getAll("city").filter(Boolean).slice(0, 50),
    postal: looksLikePostal(postal) ? postal : "",
    near: lat !== null && lng !== null ? { lat, lng } : null,
    radius: radius && RADII.includes(radius) ? radius : "25",
    ratings: params.getAll("rating") as RatingBand[],
    hours: params.getAll("hours") as HoursOption[],
    prices: params.getAll("price") as PriceLevel[],
    q: params.get("q") ?? "",
    sort: sort && SORTS.includes(sort) ? sort : "relevance",
  });
}

/* ---------------------------------------------------------- search API */

/** The search API's query string, for one page of results. */
export function toApiQuery(
  s: ExploreSelection,
  page: number,
  pageSize = PAGE_SIZE,
  overrides: { radius?: RadiusFilter; sort?: ExploreSort; track?: boolean } = {},
): string {
  const qs = new URLSearchParams();
  for (const c of s.categories) qs.append("category_slug", c);
  for (const c of s.cities) qs.append("city", c);
  if (s.postal && looksLikePostal(s.postal)) qs.set("postal_code", normalisePostal(s.postal));
  for (const r of s.ratings) qs.append("rating_band", r);
  for (const h of s.hours) qs.append("hours", h);
  for (const p of s.prices) qs.append("price", p);
  if (s.q.trim()) qs.set("q", s.q.trim());

  const radius = overrides.radius ?? s.radius;
  const sort = overrides.sort ?? s.sort;
  if (s.near) {
    qs.set("lat", String(s.near.lat));
    qs.set("lng", String(s.near.lng));
    if (radius !== "any") qs.set("radius_km", radius);
  }
  qs.set("sort", sort === "distance" && !s.near ? "relevance" : sort);
  qs.set("page", String(page));
  qs.set("page_size", String(pageSize));
  if (overrides.track === false) qs.set("track", "false");
  return qs.toString();
}

/* ------------------------------------------------------------- display */

/** Directions in the visitor's own maps app - works without an API key. */
export function directionsUrl(business: {
  name: string;
  address: string | null;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
}): string {
  const destination =
    business.latitude !== null && business.longitude !== null
      ? `${business.latitude},${business.longitude}`
      : [business.name, business.address, business.city, business.province]
          .filter(Boolean)
          .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** "https://www.example.ca/path" -> "example.ca", for a link's visible text. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Apply a search-bar submission to a selection. "Where" is one place: a
 * postal code (or its area), a city, or - when left empty - whatever location
 * was already chosen is dropped, except a "near me" point, which the Where
 * box shows as a placeholder rather than as text.
 */
export function withSearch(
  base: ExploreSelection,
  q: string,
  where: string,
  knownCities: string[],
): ExploreSelection {
  const next: ExploreSelection = { ...base, q };
  const text = where.trim();
  if (text === "") {
    next.cities = [];
    next.postal = "";
  } else if (looksLikePostal(text)) {
    next.postal = normalisePostal(text);
    next.cities = [];
    next.near = null;
  } else {
    // The directory's own spelling when the visitor typed a known city.
    const known = knownCities.find((c) => c.toLowerCase() === text.toLowerCase());
    next.cities = [known ?? text];
    next.postal = "";
    next.near = null;
  }
  return normalise(next);
}
