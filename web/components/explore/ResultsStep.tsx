"use client";

/**
 * /explore/results: the businesses matching the search made on /explore.
 *
 * Reads the selection from the shared store and keeps the URL in step with
 * it (replaceState), so the page can be reloaded or shared and shows the same
 * results. The search bar stays on top for a new search; destinations,
 * categories and the filter rail narrow this one.
 *
 * Fetching is debounced (a burst of filter clicks is one request) and every
 * request is abortable, so a slow answer to an old selection can never
 * overwrite the answer to the current one. Results scroll infinitely, with a
 * real "Load more" button beside the observer for keyboards and for browsers
 * where the sentinel never comes into view.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";

import CategoryIcon from "@/components/categories/CategoryIcon";
import PlacementNote from "@/components/ds/PlacementNote";
import ResultsMap from "@/components/ds/ResultsMap";
import { Alert, Breadcrumbs, ListingCardSkeleton, Skeleton } from "@/components/ds/feedback";
import { RatingPill } from "@/components/ds/indicators";
import { Button, Card, Select } from "@/components/ds/primitives";
import { useExploreT } from "@/components/explore/ExploreProviders";
import FavoriteButton from "@/components/explore/FavoriteButton";
import PreviewModal from "@/components/explore/PreviewModal";
import ResultCard from "@/components/explore/ResultCard";
import SearchBar, { type SearchSubmit } from "@/components/explore/SearchBar";
import { useExplore } from "@/components/explore/state";
import { useFavorites } from "@/components/explore/useFavorites";
import { useLocate } from "@/components/explore/useLocate";
import { cn } from "@/lib/cn";
import {
  PRICE_LEVELS,
  RADII,
  SORTS,
  countActive,
  fromPageQuery,
  toApiQuery,
  toPageQuery,
  withSearch,
  type ExploreSelection,
  type ExploreSort,
  type RadiusFilter,
  type RatingBand,
} from "@/lib/explore";
import { formatCount, formatPhone, telHref } from "@/lib/format";
import { HISTORY_EVENT, isSaved, recordSearch, toggleSaved as toggleSavedSearch } from "@/lib/search-history";
import { trackSearchClick } from "@/lib/track-search-click";
import type { BusinessListItem, Category, CityCount, SearchResponse } from "@/lib/types";

const FETCH_DEBOUNCE_MS = 150;

type Status = "loading" | "ready" | "error";
/** Error messages are i18n keys, so they follow a language switch. */
type ErrorKey = "results.offline" | "results.server" | "results.failed";

interface Toast {
  id: number;
  tone: "success" | "info" | "error";
  message: string;
  action?: { label: string; href: string };
}

class SearchError extends Error {
  constructor(readonly key: ErrorKey) {
    super(key);
  }
}

async function fetchPage(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/explore/search?${query}`, { signal, cache: "no-store" });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new SearchError("results.offline");
  }
  if (!res.ok) throw new SearchError(res.status === 502 ? "results.server" : "results.failed");
  return (await res.json()) as SearchResponse;
}

export default function ResultsStep({
  categories,
  cities,
}: {
  categories: Category[];
  cities: CityCount[];
}): JSX.Element {
  const { t, locale, intl } = useExploreT();
  const { selection, hydrated, toggle, set, setNear, setList, replace, reset } = useExplore();
  const { locate, locating, error: locateError } = useLocate();

  // ----------------------------------------------------------- URL sync
  useEffect(() => {
    if (!hydrated) return;
    const qs = toPageQuery(selection);
    window.history.replaceState(null, "", qs ? `/explore/results?${qs}` : "/explore/results");
  }, [hydrated, selection]);

  const categoryName = useCallback(
    (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug,
    [categories],
  );

  /** "Plumbers in Burnaby" - the heading, and the label of a saved search. */
  const describe = useCallback(
    (s: ExploreSelection): string => {
      const what = s.q
        ? `“${s.q}”`
        : s.categories.length === 1
          ? categoryName(s.categories[0])
          : s.categories.length > 1
            ? s.categories.map(categoryName).join(", ")
            : t("results.all");
      if (s.near) return t("results.nearYou", { what });
      const where = s.postal || s.cities.join(", ");
      return where ? t("results.inPlace", { what, where }) : t("results.inMetro", { what });
    },
    [categoryName, t],
  );

  // A filter the visitor just changed: once its results land, a toast says
  // how many there are. Loads that nobody asked for (arrival, paging) stay
  // quiet.
  const announceNext = useRef(false);
  const announced = useCallback(
    (action: () => void) => () => {
      announceNext.current = true;
      action();
    },
    [],
  );

  // ------------------------------------------------------------ results
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [items, setItems] = useState<BusinessListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [widenedFrom, setWidenedFrom] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const requestId = useRef(0);
  // The query the loaded pages came from - after widening, not the
  // selection's own - so page 2 continues the same list.
  const effective = useRef<{ selection: ExploreSelection; widened: boolean }>({
    selection,
    widened: false,
  });
  const searchIds = useRef(new Map<number, string>());
  const loadingMore = useRef(false);

  const queryKey = useMemo(() => toApiQuery(selection, 1), [selection]);

  useEffect(() => {
    if (!hydrated) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setMore("idle");

    const timer = window.setTimeout(() => {
      (async () => {
        let body = await fetchPage(toApiQuery(selection, 1), controller.signal);
        let widened: string | null = null;

        // Nothing within the radius: show the closest at any distance,
        // nearest first, and say plainly that that is what these are.
        if (body.total === 0 && selection.near && selection.radius !== "any") {
          const wider = await fetchPage(
            toApiQuery(selection, 1, undefined, { radius: "any", sort: "distance" }),
            controller.signal,
          );
          if (wider.total > 0) {
            body = wider;
            widened = selection.radius;
          }
        }

        if (id !== requestId.current) return;
        effective.current = { selection, widened: widened !== null };
        searchIds.current = new Map(
          body.search_id ? body.items.map((item) => [item.id, body.search_id as string]) : [],
        );
        setItems(body.items);
        setTotal(body.total);
        setPage(body.page);
        setHasNext(body.has_next);
        setWidenedFrom(widened);
        setStatus("ready");
        if (countActive(selection) > 0) recordSearch(toPageQuery(selection), describe(selection));
        if (announceNext.current) {
          announceNext.current = false;
          setToast({
            id: Date.now(),
            tone: "info",
            message: t("results.filtered", {
              count: body.total,
              formatted: formatCount(body.total, intl),
            }),
          });
        }
      })().catch((cause: unknown) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        setError(cause instanceof SearchError ? cause.key : "results.failed");
        setStatus("error");
      });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // queryKey stands for `selection` - same content, stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, queryKey, attempt]);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || !hasNext || status !== "ready") return;
    loadingMore.current = true;
    setMore("loading");
    const id = requestId.current;
    const { selection: used, widened } = effective.current;
    try {
      const body = await fetchPage(
        toApiQuery(
          used,
          page + 1,
          undefined,
          widened ? { radius: "any", sort: "distance" } : {},
        ),
      );
      if (id !== requestId.current) return;
      if (body.search_id) {
        for (const item of body.items) searchIds.current.set(item.id, body.search_id);
      }
      // The paid rotation can turn between page loads; never show a card twice.
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...body.items.filter((item) => !seen.has(item.id))];
      });
      setPage(body.page);
      setHasNext(body.has_next);
      setTotal(body.total);
      setMore("idle");
    } catch {
      if (id === requestId.current) setMore("error");
    } finally {
      loadingMore.current = false;
    }
  }, [hasNext, page, status]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (node === null || !hasNext || more === "error" || status !== "ready") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNext, loadMore, more, status]);

  // ------------------------------------------------------------ search bar
  const cityNames = useMemo(() => cities.map((c) => c.city), [cities]);
  const onSearch = useCallback(
    ({ q, where, nearMe }: SearchSubmit) => {
      // A new search keeps the category and rating filters, replaces the
      // words and the place.
      replace(withSearch(selection, q, where, cityNames));
      if (nearMe) locate();
    },
    [cityNames, locate, replace, selection],
  );

  const onLive = useCallback((q: string) => set({ q }), [set]);

  // ------------------------------------------------------------ favorites
  const favorites = useFavorites();
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleSaved = useCallback(
    async (businessId: number, name: string) => {
      const result = await favorites.toggle(businessId);
      const id = Date.now();
      if (result === "signed-out") {
        const next = `${window.location.pathname}${window.location.search}`;
        setToast({
          id,
          tone: "info",
          message: t("toast.signIn"),
          action: { label: t("toast.signInAction"), href: `/login?next=${encodeURIComponent(next)}` },
        });
      } else if (result === "failed") {
        setToast({ id, tone: "error", message: t("toast.failed", { name }) });
      } else {
        setToast({
          id,
          tone: "success",
          message: result === "saved" ? t("toast.saved", { name }) : t("toast.removed", { name }),
        });
      }
    },
    [favorites, t],
  );

  // ------------------------------------------------------------ view state
  const [tab, setTab] = useState<"results" | "saved">("results");
  // ?tab=saved - the header's "Saved businesses" link.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("tab") === "saved") setTab("saved");
  }, [searchParams]);

  // ---------------------------------------------------------- saved search
  const pageQuery = toPageQuery(selection);
  const [searchIsSaved, setSearchIsSaved] = useState(false);
  useEffect(() => {
    const check = () => setSearchIsSaved(pageQuery !== "" && isSaved(pageQuery));
    check();
    window.addEventListener(HISTORY_EVENT, check);
    return () => window.removeEventListener(HISTORY_EVENT, check);
  }, [pageQuery]);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preview, setPreview] = useState<{ slug: string; distanceKm: number | null } | null>(null);

  useEffect(() => {
    if (tab === "saved" && favorites.list === null && !favorites.loading && favorites.error === null) {
      favorites.reload();
    }
  }, [tab, favorites]);

  // ------------------------------------------------------------ chips
  const chips: { key: string; label: string; icon?: React.ReactNode; remove: () => void }[] = [
    ...selection.categories.map((slug) => ({
      key: `c-${slug}`,
      label: categoryName(slug),
      icon: <CategoryIcon slug={slug} className="size-3.5" />,
      remove: () => toggle("categories", slug),
    })),
    ...selection.cities.map((city) => ({
      key: `city-${city}`,
      label: city,
      remove: () => toggle("cities", city),
    })),
    ...(selection.postal
      ? [{ key: "postal", label: t("results.postal", { postal: selection.postal }), remove: () => set({ postal: "" }) }]
      : []),
    ...(selection.near
      ? [
          {
            key: "near",
            label: t("results.nearMe", { radius: t(`radius.${selection.radius}`).toLowerCase() }),
            remove: () => setNear(null),
          },
        ]
      : []),
    // One chip for a radio choice ("4.5 stars and up"); bands one by one only
    // for a combination the radio cannot express (from a shared link).
    ...(RATING_CHOICES.some((c) => c.value && c.value === ratingChoice(selection.ratings))
      ? [
          {
            key: "rating",
            label: `★ ${t(RATING_CHOICES.find((c) => c.value === ratingChoice(selection.ratings))?.label ?? "")}`,
            remove: () => setList("ratings", []),
          },
        ]
      : selection.ratings.map((band) => ({
          key: `r-${band}`,
          label: `★ ${t(`rating.${band}`)}`,
          remove: () => toggle("ratings", band),
        }))),
    ...selection.hours.map((option) => ({
      key: `h-${option}`,
      label: t(`hours.${option}`),
      remove: () => toggle("hours", option),
    })),
    ...selection.prices.map((level) => ({
      key: `p-${level}`,
      label: level,
      remove: () => toggle("prices", level),
    })),
  ];

  // What the empty state offers: undo the narrowest filters first.
  const suggestions = [
    selection.ratings.length > 0 && { label: t("results.anyRating"), run: () => setList("ratings", []) },
    selection.prices.length > 0 && { label: t("results.anyPrice"), run: () => setList("prices", []) },
    selection.hours.length > 0 && { label: t("results.anyHours"), run: () => setList("hours", []) },
    selection.near !== null &&
      selection.radius !== "any" && { label: t("results.anyDistance"), run: () => set({ radius: "any" }) },
    (selection.cities.length > 0 || selection.postal !== "") && {
      label: t("results.allAreas"),
      run: () => set({ cities: [], postal: "" }),
    },
    selection.categories.length > 0 && { label: t("filters.allCategories"), run: () => setList("categories", []) },
    selection.q !== "" && { label: t("results.dropKeyword", { q: selection.q }), run: () => set({ q: "" }) },
  ].filter((entry): entry is { label: string; run: () => void } => Boolean(entry));

  const mappable = items.filter((b) => b.latitude !== null && b.longitude !== null);

  const heading = describe(selection);

  if (!hydrated) {
    return <ResultsSkeleton label={t("results.loading")} layout="grid" />;
  }

  return (
    <div className="space-y-4">
      {/* Sticks under the header on tablets and up; on a phone the two
          stacked fields would cover a third of the screen. */}
      <div className="z-30 -mx-4 bg-canvas/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:-mx-6 sm:px-6 md:sticky md:top-16">
      <SearchBar
        q={selection.q}
        where={selection.postal || (selection.cities.length === 1 ? selection.cities[0] : "")}
        usingLocation={selection.near !== null}
        locating={locating}
        categories={categories}
        cities={cities}
        onSearch={onSearch}
        onCategory={(slug) => setList("categories", [slug])}
        onNearMe={() => locate()}
        onBusiness={(slug) => setPreview({ slug, distanceKm: null })}
        onHistory={(query) => replace(fromPageQuery(new URLSearchParams(query)))}
        onLive={onLive}
      />
      </div>
      {locateError !== null ? <Alert locale={locale} tone="warning">{t(locateError)}</Alert> : null}

      <Breadcrumbs locale={locale}
        label={t("results.breadcrumb")}
        items={[
          { label: t("results.explore"), href: "/explore" },
          ...(selection.categories.length === 1
            ? [{ label: categoryName(selection.categories[0]), href: `/explore/results?category=${encodeURIComponent(selection.categories[0])}` }]
            : []),
          {
            label: selection.near
              ? t("filters.nearMe")
              : selection.postal || (selection.cities.length > 0 ? selection.cities.join(", ") : t("results.allAreas")),
          },
        ]}
      />

      {/* ------------------------------------- destination + category pills */}
      <div className="space-y-2">
        <nav aria-label={t("filters.destinations")} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li>
              <Pill
                active={selection.cities.length === 0 && !selection.postal && !selection.near}
                label={t("filters.allAreas")}
                icon={<MapPin className="size-4" aria-hidden="true" />}
                onClick={announced(() => {
                  set({ cities: [], postal: "" });
                  setNear(null);
                })}
              />
            </li>
            <li>
              <Pill
                active={selection.near !== null}
                label={t("filters.nearMe")}
                icon={
                  locating ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LocateFixed className="size-4" aria-hidden="true" />
                  )
                }
                onClick={announced(() => (selection.near ? setNear(null) : locate()))}
              />
            </li>
            {cities.map(({ city }) => (
              <li key={city}>
                <Pill
                  active={selection.cities.length === 1 && selection.cities[0] === city}
                  label={city}
                  onClick={announced(() => {
                    if (selection.cities.length === 1 && selection.cities[0] === city) {
                      setList("cities", []);
                    } else {
                      set({ postal: "" });
                      setList("cities", [city]);
                      setNear(null);
                    }
                  })}
                />
              </li>
            ))}
          </ul>
        </nav>
        {categories.length > 0 ? (
          <nav aria-label={t("filters.categories")} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex gap-2 pb-1 sm:flex-wrap">
              <li>
                <Pill
                  active={selection.categories.length === 0}
                  label={t("filters.allCategories")}
                  onClick={announced(() => setList("categories", []))}
                />
              </li>
              {categories.map((category) => {
                const active =
                  selection.categories.length === 1 && selection.categories[0] === category.slug;
                return (
                  <li key={category.id}>
                    <Pill
                      active={active}
                      label={category.name}
                      icon={<CategoryIcon slug={category.slug} className="size-4" />}
                      // A second click on the active category clears it.
                      onClick={announced(() => setList("categories", active ? [] : [category.slug]))}
                    />
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* ---------------------------------------------------------- filters */}
        <aside className="lg:sticky lg:top-40 lg:self-start">
          <Button
            variant="secondary"
            className="w-full lg:hidden"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="explore-filters"
          >
            <SlidersHorizontal aria-hidden="true" />
            {t("filters.toggle")}
            {chips.length > 0 ? (
              <span className="rounded-pill bg-brand-100 px-1.5 text-micro text-brand-800">
                {chips.length}
              </span>
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className={cn("transition-transform", filtersOpen && "rotate-180")}
            />
          </Button>
          <Card
            id="explore-filters"
            className={cn(
              "mt-3 space-y-6 p-4 lg:mt-0 lg:block lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto",
              filtersOpen ? "block" : "hidden",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-card-title text-ink">{t("filters.title")}</h2>
              {chips.length > 0 || selection.q ? (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={reset}>
                  {t("filters.clearAll")}
                </Button>
              ) : null}
            </div>

            <fieldset>
              <legend className="mb-2 text-micro uppercase text-ink-subtle">{t("filters.rating")}</legend>
              <div className="space-y-1">
                {RATING_CHOICES.map((choice) => {
                  const checked = ratingChoice(selection.ratings) === choice.value;
                  return (
                    <label
                      key={choice.value || "any"}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-input px-2 py-1.5 text-body",
                        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        checked ? "bg-brand-50 font-medium text-brand-800" : "text-ink-muted hover:bg-surface-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="rating"
                        checked={checked}
                        onChange={announced(() => setList("ratings", choice.bands))}
                        className="size-4 accent-brand-700"
                      />
                      {choice.value ? (
                        <Star className="size-3.5 fill-rating text-rating" aria-hidden="true" />
                      ) : null}
                      {t(choice.label)}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-micro uppercase text-ink-subtle">{t("filters.price")}</legend>
              <p className="mb-2 text-meta text-ink-muted">{t("filters.priceHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_LEVELS.map((level) => {
                  const checked = selection.prices.includes(level);
                  return (
                    <label
                      key={level}
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-pill border px-3 py-1 text-body font-medium tabular transition-colors",
                        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        checked
                          ? "border-brand-700 bg-brand-50 text-brand-800"
                          : "border-line text-ink-muted hover:border-line-strong",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={announced(() => toggle("prices", level))}
                      />
                      {level}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-micro uppercase text-ink-subtle">{t("filters.location")}</legend>
              {selection.near !== null ? (
                <div className="flex items-center justify-between gap-2 rounded-input bg-brand-50 px-2.5 py-2 text-body text-brand-800">
                  <span className="inline-flex items-center gap-2">
                    <LocateFixed className="size-4" aria-hidden="true" />
                    {t("filters.yourLocation")}
                  </span>
                  <button
                    type="button"
                    onClick={announced(() => setNear(null))}
                    aria-label={t("filters.stopLocation")}
                    className="flex size-6 items-center justify-center rounded-pill hover:bg-brand-100"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={announced(() => locate())}
                  disabled={locating}
                >
                  {locating ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <LocateFixed aria-hidden="true" />
                  )}
                  {locating ? t("filters.locating") : t("filters.useLocation")}
                </Button>
              )}
              <label htmlFor="explore-radius" className="mt-3 block text-meta font-medium text-ink-muted">
                {t("filters.distance")}
              </label>
              <Select
                id="explore-radius"
                className="mt-1"
                value={selection.radius}
                disabled={selection.near === null}
                aria-describedby={selection.near === null ? "explore-radius-hint" : undefined}
                onChange={(event) => {
                  announceNext.current = true;
                  set({ radius: event.target.value as RadiusFilter });
                }}
              >
                {RADII.map((radius) => (
                  <option key={radius} value={radius}>
                    {t(`radius.${radius}`)}
                  </option>
                ))}
              </Select>
              {selection.near === null ? (
                <p id="explore-radius-hint" className="mt-1 text-meta text-ink-muted">
                  {t("filters.distanceHint")}
                </p>
              ) : null}
            </fieldset>
          </Card>
        </aside>

        {/* ---------------------------------------------------------- results */}
        <section aria-labelledby="results-heading" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 id="results-heading" className="text-section-heading text-ink">
                  {heading}
                </h1>
                {pageQuery !== "" ? (
                  <button
                    type="button"
                    aria-pressed={searchIsSaved}
                    aria-label={searchIsSaved ? t("results.searchSaved") : t("results.saveSearch")}
                    title={searchIsSaved ? t("results.searchSaved") : t("results.saveSearch")}
                    onClick={() => {
                      const saved = toggleSavedSearch(pageQuery, heading);
                      setToast({
                        id: Date.now(),
                        tone: saved ? "success" : "info",
                        message: saved ? t("toast.searchSaved") : t("toast.searchRemoved"),
                      });
                    }}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-input transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                      searchIsSaved ? "text-brand-700" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                    )}
                  >
                    {searchIsSaved ? (
                      <BookmarkCheck className="size-4" aria-hidden="true" />
                    ) : (
                      <BookmarkPlus className="size-4" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </div>
              <p className="text-meta text-ink-muted" aria-live="polite">
                {status === "loading"
                  ? t("results.searching")
                  : status === "ready"
                    ? `${t("results.found", { count: total, formatted: formatCount(total, intl) })}${
                        total > items.length
                          ? ` · ${t("results.showing", {
                              shown: formatCount(items.length, intl),
                              total: formatCount(total, intl),
                            })}`
                          : ""
                      }`
                    : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="results-sort" className="sr-only">
                {t("sort.label")}
              </label>
              <Select
                id="results-sort"
                className="h-9 w-auto"
                value={selection.sort}
                onChange={(event) => set({ sort: event.target.value as ExploreSort })}
              >
                {SORTS.filter((sort) => sort !== "distance" || selection.near !== null).map((sort) => (
                  <option key={sort} value={sort}>
                    {t(`sort.${sort}`)}
                  </option>
                ))}
              </Select>
              <div className="flex rounded-input border border-line-strong" role="group" aria-label={t("results.layout")}>
                <IconToggle active={layout === "grid"} label={t("results.grid")} onClick={() => setLayout("grid")}>
                  <LayoutGrid aria-hidden="true" />
                </IconToggle>
                <IconToggle active={layout === "list"} label={t("results.list")} onClick={() => setLayout("list")}>
                  <List aria-hidden="true" />
                </IconToggle>
              </div>
              <Button
                variant={showMap ? "primary" : "secondary"}
                size="sm"
                aria-pressed={showMap}
                onClick={() => setShowMap((open) => !open)}
              >
                <MapIcon aria-hidden="true" />
                {showMap ? t("results.hideMap") : t("results.showMap")}
              </Button>
            </div>
          </div>

          {chips.length > 0 ? (
            <ul aria-label={t("results.active")} className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={announced(chip.remove)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-meta text-ink hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {chip.icon}
                    {chip.label}
                    <X className="size-3" aria-hidden="true" />
                    <span className="sr-only">({t("results.remove")})</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div role="tablist" className="flex gap-1 border-b border-line">
            <TabButton active={tab === "results"} onClick={() => setTab("results")} controls="results-panel">
              {t("results.tabs.results")}
            </TabButton>
            <TabButton active={tab === "saved"} onClick={() => setTab("saved")} controls="saved-panel">
              <Bookmark className="size-4" aria-hidden="true" />
              {t("results.tabs.saved")}
            </TabButton>
          </div>

      {tab === "results" ? (
        <div id="results-panel" role="tabpanel" className="space-y-4">
          {widenedFrom !== null && status === "ready" ? (
            <Alert locale={locale} tone="info">{t("results.widened", { km: widenedFrom })}</Alert>
          ) : null}

          {showMap ? (
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-raised">
              <div className="h-72 sm:h-96">
                {mappable.length > 0 ? (
                  <ResultsMap locale={locale} businesses={mappable} origin={selection.near ?? undefined} />
                ) : (
                  <div className="flex h-full items-center justify-center bg-surface-muted text-meta text-ink-muted">
                    {t("results.mapEmpty")}
                  </div>
                )}
              </div>
              <p className="border-t border-line px-3 py-2 text-meta text-ink-muted">
                {t("results.mapCaption", {
                  mapped: formatCount(mappable.length, intl),
                  shown: formatCount(items.length, intl),
                })}
              </p>
            </div>
          ) : null}

          {status === "loading" ? (
            <ResultsSkeleton label={t("results.loading")} layout={layout} />
          ) : status === "error" ? (
            <Card role="alert" className="flex flex-col items-center gap-3 border-danger/30 bg-danger-bg px-6 py-10 text-center">
              <h2 className="text-card-title text-danger">{t("results.errorTitle")}</h2>
              <p className="max-w-prose text-body text-danger">{t(error ?? "results.failed")}</p>
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                <RotateCcw aria-hidden="true" />
                {t("results.tryAgain")}
              </Button>
            </Card>
          ) : items.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-ink-muted">
                <SearchX className="size-5" aria-hidden="true" />
              </span>
              <h2 className="text-section-heading text-ink">{t("results.emptyTitle")}</h2>
              <p className="max-w-prose text-body text-ink-muted">{t("results.emptyBody")}</p>
              {suggestions.length > 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-meta text-ink-muted">{t("results.tryThese")}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.slice(0, 4).map((suggestion) => (
                      <Button key={suggestion.label} variant="secondary" size="sm" onClick={announced(suggestion.run)}>
                        {suggestion.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <Button variant="ghost" size="sm" onClick={reset}>
                {t("filters.clearAll")}
              </Button>
            </Card>
          ) : (
            <>
              <ul key={queryKey} className={cn(gridClass(layout), "motion-safe:animate-rise-in")}>
                {items.map((business) => (
                  <li key={business.id}>
                    <ResultCard
                      business={business}
                      layout={layout}
                      saved={favorites.ids.has(business.id)}
                      onToggleSaved={() => void toggleSaved(business.id, business.name)}
                      onPreview={() => {
                        trackSearchClick(searchIds.current.get(business.id), business.id, "view");
                        setPreview({ slug: business.slug, distanceKm: business.distance_km });
                      }}
                      onCall={() =>
                        trackSearchClick(searchIds.current.get(business.id), business.id, "call")
                      }
                    />
                  </li>
                ))}
              </ul>

              <div ref={sentinel} className="flex flex-col items-center gap-2 pt-2">
                {more === "loading" ? (
                  <p role="status" className="inline-flex items-center gap-2 text-meta text-ink-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t("results.loadingMore")}
                  </p>
                ) : more === "error" ? (
                  <Alert locale={locale} tone="error" className="w-full">
                    {t("results.loadMoreError")}{" "}
                    <button type="button" className="font-medium underline" onClick={() => void loadMore()}>
                      {t("results.tryAgain")}
                    </button>
                  </Alert>
                ) : hasNext ? (
                  <Button variant="secondary" size="sm" onClick={() => void loadMore()}>
                    {t("results.loadMore")}
                  </Button>
                ) : items.length > 3 ? (
                  <p className="text-meta text-ink-muted">{t("results.end")}</p>
                ) : null}
              </div>

              <PlacementNote items={items} locale={locale} />
            </>
          )}
        </div>
      ) : (
        <div id="saved-panel" role="tabpanel">
          <SavedPanel
            favorites={favorites}
            onPreview={(slug) => setPreview({ slug, distanceKm: null })}
            onRemove={(id, name) => void toggleSaved(id, name)}
          />
        </div>
      )}

        </section>
      </div>

      {preview !== null ? (
        <PreviewModal
          slug={preview.slug}
          distanceKm={preview.distanceKm}
          saved={favorites.ids.has(
            items.find((b) => b.slug === preview.slug)?.id ??
              favorites.list?.find((f) => f.slug === preview.slug)?.business_id ??
              -1,
          )}
          onToggleSaved={(id) => {
            const name =
              items.find((b) => b.id === id)?.name ??
              favorites.list?.find((f) => f.business_id === id)?.name ??
              "";
            void toggleSaved(id, name);
          }}
          onClose={() => setPreview(null)}
        />
      ) : null}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
        {toast !== null ? (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-card border px-4 py-3 text-body shadow-overlay motion-safe:animate-rise-in",
              toast.tone === "success" && "border-success/30 bg-success-bg text-success",
              toast.tone === "info" && "border-line bg-surface text-ink",
              toast.tone === "error" && "border-danger/30 bg-danger-bg text-danger",
            )}
          >
            {toast.tone === "success" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
            <span>{toast.message}</span>
            {toast.action ? (
              <Link href={toast.action.href} className="font-medium text-brand-700 underline">
                {toast.action.label}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label={t("toast.dismiss")}
              className="flex size-6 items-center justify-center rounded-pill hover:bg-surface-muted"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

function gridClass(layout: "grid" | "list"): string {
  return layout === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "grid gap-3";
}

function ResultsSkeleton({ label, layout }: { label: string; layout: "grid" | "list" }): JSX.Element {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">{label}</span>
      <div className={gridClass(layout)}>
        {Array.from({ length: 6 }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={active ? controls : undefined}
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-body font-medium",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
        active ? "border-brand-700 text-ink" : "border-transparent text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function IconToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center first:rounded-l-input last:rounded-r-input [&_svg]:size-4",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
        active ? "bg-brand-50 text-brand-800" : "bg-surface text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function SavedPanel({
  favorites,
  onPreview,
  onRemove,
}: {
  favorites: ReturnType<typeof useFavorites>;
  onPreview: (slug: string) => void;
  onRemove: (businessId: number, name: string) => void;
}): JSX.Element {
  const { t, locale } = useExploreT();

  // 401 from the saved list means nobody is signed in.
  if (favorites.error === "signed-out") {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-ink-muted">
          <Bookmark className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-section-heading text-ink">{t("saved.signedOutTitle")}</h2>
        <p className="max-w-prose text-body text-ink-muted">{t("saved.signedOutBody")}</p>
        <Button asChild size="sm">
          <Link href="/login?next=%2Fexplore%2Fresults">{t("toast.signInAction")}</Link>
        </Button>
      </Card>
    );
  }

  if (favorites.error !== null) {
    return (
      <Alert locale={locale} tone="error">
        {t("saved.loadError")}{" "}
        <button type="button" className="font-medium underline" onClick={favorites.reload}>
          {t("results.tryAgain")}
        </button>
      </Alert>
    );
  }

  if (favorites.list === null) {
    return (
      <div role="status" aria-busy="true" className="grid gap-3 md:grid-cols-2">
        <span className="sr-only">{t("saved.loading")}</span>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
    );
  }

  if (favorites.list.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-ink-muted">
          <Bookmark className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-section-heading text-ink">{t("saved.emptyTitle")}</h2>
        <p className="max-w-prose text-body text-ink-muted">{t("saved.emptyBody")}</p>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {favorites.list.map((saved) => {
        const phone = formatPhone(saved.phone);
        const tel = telHref(saved.phone);
        return (
          <li key={saved.business_id}>
            <Card className="flex items-start gap-3 p-4">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-700"
              >
                <CategoryIcon slug={saved.category_slug} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-card-title text-ink">
                  <button
                    type="button"
                    onClick={() => onPreview(saved.slug)}
                    className="text-left hover:text-brand-700 hover:underline"
                  >
                    {saved.name}
                  </button>
                </h2>
                <p className="text-meta text-ink-muted">
                  {saved.category_name} · {saved.city}, {saved.province}
                </p>
                <RatingPill
                  rating={saved.rating}
                  reviewCount={saved.review_count}
                  size="sm"
                  locale={locale}
                  className="mt-1.5"
                />
                {phone !== null && tel !== null ? (
                  <p className="mt-1.5 text-meta">
                    <a href={tel} className="tabular text-brand-700 hover:underline">
                      {phone}
                    </a>
                  </p>
                ) : null}
              </div>
              <FavoriteButton saved name={saved.name} onToggle={() => onRemove(saved.business_id, saved.name)} />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** The rating filter as the radio choices it is offered as. */
const RATING_CHOICES: { value: string; label: string; bands: RatingBand[] }[] = [
  { value: "", label: "filters.ratingAny", bands: [] },
  { value: "4.5", label: "filters.rating45", bands: ["4.5", "5"] },
  { value: "5", label: "filters.rating5", bands: ["5"] },
];

function ratingChoice(bands: RatingBand[]): string {
  const key = [...bands].sort().join(",");
  return RATING_CHOICES.find((c) => [...c.bands].sort().join(",") === key)?.value ?? "custom";
}

function Pill({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-pill border px-3 text-body transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-brand-700 bg-brand-700 text-ink-inverse"
          : "border-line bg-surface text-ink hover:border-line-strong",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
