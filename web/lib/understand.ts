/**
 * Smart search: free text typed (or spoken) into the What box, read by the
 * backend as filters - "plumber in Burnaby open now" becomes the Plumbers
 * category, the city Burnaby and the open-now hours filter, exactly as if the
 * visitor had chosen them.
 *
 * Used on both sides of the bridge: the route handler
 * (app/api/explore/understand) cleans the backend's answer with
 * sanitiseUnderstanding(); the /explore components fetch it through
 * understand(), which keeps a small per-tab cache so Back and Forward do not
 * ask again, and apply it with applyUnderstanding().
 *
 * `source: "keywords"` always means "search the words as typed" - the model
 * was unavailable, or found nothing to turn into a filter.
 */

import {
  EMPTY_SELECTION,
  HOURS_OPTIONS,
  PRICE_LEVELS,
  RATING_BANDS,
  looksLikePostal,
  normalise,
  normalisePostal,
  toPageQuery,
  withSearch,
  type ExploreSelection,
} from "@/lib/explore";
import type { SearchUnderstanding } from "@/lib/types";

export type UnderstandLang = "en" | "fr";

/** The search box's own limit; longer text is cut, not refused. */
export const UNDERSTAND_MAX_LENGTH = 128;

/** The answer that means "search these words as they are". */
export function keywordsOnly(q: string): SearchUnderstanding {
  const text = q.trim();
  return {
    source: "keywords",
    category_slugs: [],
    cities: [],
    postal_code: null,
    near_me: false,
    hours: [],
    rating_bands: [],
    price_levels: [],
    keywords: text || null,
    unsupported: [],
    summary: "",
  };
}

function strings(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()).slice(0, limit)
    : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  return strings(value).filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/**
 * Whatever came back, the shape the page relies on - or the keywords
 * fallback when it is not an answer at all.
 */
export function sanitiseUnderstanding(raw: unknown, q: string): SearchUnderstanding {
  if (raw === null || typeof raw !== "object") return keywordsOnly(q);
  const r = raw as Record<string, unknown>;
  if (r.source !== "ai") return keywordsOnly(typeof r.keywords === "string" ? r.keywords : q);
  const postal = typeof r.postal_code === "string" && looksLikePostal(r.postal_code) ? normalisePostal(r.postal_code) : null;
  const keywords = typeof r.keywords === "string" && r.keywords.trim() !== "" ? r.keywords.trim() : null;
  return {
    source: "ai",
    category_slugs: strings(r.category_slugs),
    cities: strings(r.cities),
    postal_code: postal,
    near_me: r.near_me === true,
    hours: oneOf(r.hours, HOURS_OPTIONS),
    rating_bands: oneOf(r.rating_bands, RATING_BANDS),
    price_levels: oneOf(r.price_levels, PRICE_LEVELS),
    keywords: keywords ? keywords.slice(0, UNDERSTAND_MAX_LENGTH) : null,
    unsupported: strings(r.unsupported, 5),
    summary: typeof r.summary === "string" ? r.summary.trim().slice(0, 200) : "",
  };
}

/* ------------------------------------------------------ client: fetching */

const CACHE_SIZE = 20;
// Per tab and per page load: module state survives client-side navigation
// between /explore and /explore/results, which is what Back and Forward do.
const cache = new Map<string, SearchUnderstanding>();

function cacheKey(q: string, lang: UnderstandLang): string {
  return `${lang}|${q.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Ask the route handler what `q` means. Never rejects except on abort: a
 * failure is the keywords fallback, which is not cached, so the next try asks
 * again.
 */
export async function understand(
  q: string,
  lang: UnderstandLang,
  signal?: AbortSignal,
): Promise<SearchUnderstanding> {
  const text = q.trim().slice(0, UNDERSTAND_MAX_LENGTH);
  const key = cacheKey(text, lang);
  const hit = cache.get(key);
  if (hit) {
    // Refresh its place: the oldest entry is the one dropped.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  try {
    const res = await fetch(`/api/explore/understand?${new URLSearchParams({ q: text, lang }).toString()}`, {
      signal,
    });
    if (!res.ok) return keywordsOnly(text);
    const answer = sanitiseUnderstanding(await res.json(), text);
    cache.set(key, answer);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return answer;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    return keywordsOnly(text);
  }
}

/* ------------------------------------------------------ client: applying */

/**
 * The selection an answer stands for, or null when there is nothing to apply
 * - a keywords answer, or an "ai" one that found no filter at all - and the
 * caller should run the plain text search it always did.
 *
 * An understood search is a complete intent, so it starts from empty, keeping
 * only how results are sorted and how far "near me" reaches. A place typed in
 * the Where box outranks one read from the What text. `nearMe` is the answer's
 * (or the typed phrase's) "near me", when no named place overrides it; the
 * caller runs the locate flow for it.
 */
export function applyUnderstanding(
  base: ExploreSelection,
  answer: SearchUnderstanding,
  where: string,
  known: { categories: string[]; cities: string[] },
): { selection: ExploreSelection; nearMe: boolean } | null {
  if (answer.source !== "ai") return null;

  const categories = known.categories.length > 0
    ? answer.category_slugs.filter((slug) => known.categories.includes(slug))
    : answer.category_slugs;
  // The directory's own spelling; a city it does not list would search an
  // empty town, so it is dropped.
  const cities = answer.cities
    .map((city) => known.cities.find((c) => c.toLowerCase() === city.toLowerCase()) ?? (known.cities.length > 0 ? null : city))
    .filter((city): city is string => city !== null);

  let selection: ExploreSelection = normalise({
    ...EMPTY_SELECTION,
    sort: base.sort,
    radius: base.radius,
    categories,
    cities,
    postal: answer.postal_code && cities.length === 0 ? answer.postal_code : "",
    ratings: answer.rating_bands,
    hours: answer.hours,
    prices: answer.price_levels,
    q: answer.keywords ?? "",
  });
  if (where.trim() !== "") selection = withSearch(selection, selection.q, where, known.cities);

  const placed = selection.cities.length > 0 || selection.postal !== "";
  const nearMe = answer.near_me && !placed;
  const found =
    nearMe ||
    placed ||
    selection.categories.length > 0 ||
    selection.ratings.length > 0 ||
    selection.hours.length > 0 ||
    selection.prices.length > 0;
  return found ? { selection, nearMe } : null;
}

/**
 * What a smart search chose, minus what the visitor adjusts without changing
 * the search (sort, distance, the located point). While the selection still
 * has this key, the "Showing: ..." line describes it.
 */
export function smartKey(s: ExploreSelection): string {
  return toPageQuery({ ...s, near: null, radius: "25", sort: "relevance" });
}
