"use client";

/**
 * What + Where, each with suggestions as you type.
 *
 *   What   a business name or a trade. Suggests matching categories and
 *          matching businesses. "plumber near me" is understood as a trade
 *          plus the near-me intent.
 *   Where  a city, a postal code or its first three characters ("V6B"), or
 *          the visitor's position. Suggests the cities that actually have
 *          listings, so a typo does not silently search an empty town.
 *
 * With the What box empty, its list offers this browser's saved and recent
 * searches instead (lib/search-history.ts).
 *
 * Each field is an ARIA 1.2 combobox: arrow keys move through the list,
 * Enter picks the highlighted option (or searches, with none highlighted),
 * Escape closes it. Business suggestions are debounced - one lookup once the
 * visitor pauses, not one per keystroke. With `onLive` (the results page),
 * the words typed also apply to the results after the same kind of pause;
 * otherwise nothing is searched until Enter or the button.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bookmark, Building2, Hash, History, LocateFixed, Loader2, MapPin, Search, Trash2, X } from "lucide-react";

import CategoryIcon from "@/components/categories/CategoryIcon";
import { Button } from "@/components/ds/primitives";
import { useExploreT } from "@/components/explore/ExploreProviders";
import { categoryName, categoryNames, foldAccents } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { looksLikePostal, normalisePostal } from "@/lib/explore";
import { splitNearMe } from "@/lib/near-me";
import {
  HISTORY_EVENT,
  clearRecent,
  recentSearches,
  savedSearches,
  type SavedSearch,
} from "@/lib/search-history";
import type { BusinessListItem, Category, CityCount, SearchResponse } from "@/lib/types";

const SUGGEST_DEBOUNCE_MS = 250;
const LIVE_DEBOUNCE_MS = 400;

interface Option {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export interface SearchSubmit {
  q: string;
  where: string;
  nearMe: boolean;
}

export default function SearchBar({
  q,
  where,
  usingLocation,
  locating,
  categories,
  cities,
  onSearch,
  onCategory,
  onNearMe,
  onBusiness,
  onHistory,
  onLive,
  size = "md",
}: {
  q: string;
  /** The city or postal code currently applied, as display text. */
  where: string;
  usingLocation: boolean;
  locating: boolean;
  categories: Category[];
  cities: CityCount[];
  onSearch: (search: SearchSubmit) => void;
  onCategory: (slug: string) => void;
  onNearMe: () => void;
  onBusiness: (slug: string) => void;
  /** Replay a saved or recent search - its /explore/results query string. */
  onHistory: (query: string) => void;
  /** Apply the What words as they are typed (debounced). */
  onLive?: (q: string) => void;
  size?: "md" | "lg";
}): JSX.Element {
  const { t, locale } = useExploreT();
  const [what, setWhat] = useState(q);
  const [place, setPlace] = useState(where);

  // Filters changed elsewhere (a chip removed, "clear all"): show them. Not
  // when the change is this box's own live update coming back - that would
  // strip the trailing space of a word still being typed.
  useEffect(() => {
    setWhat((current) => ((splitNearMe(current.trim()).query ?? "") === q ? current : q));
  }, [q]);
  useEffect(() => setPlace(where), [where]);

  // ------------------------------------------------------------ live words
  useEffect(() => {
    if (!onLive) return;
    const words = splitNearMe(what.trim()).query ?? "";
    if (words === q) return;
    const timer = window.setTimeout(() => onLive(words), LIVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [what, q, onLive]);

  // ------------------------------------------------------- search history
  const [history, setHistory] = useState<{ recent: SavedSearch[]; saved: SavedSearch[] }>({
    recent: [],
    saved: [],
  });
  useEffect(() => {
    const load = () => setHistory({ recent: recentSearches(), saved: savedSearches() });
    load();
    window.addEventListener(HISTORY_EVENT, load);
    window.addEventListener("storage", load); // another tab changed it
    return () => {
      window.removeEventListener(HISTORY_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  // ------------------------------------------------ business suggestions
  const [matches, setMatches] = useState<BusinessListItem[]>([]);
  const [matching, setMatching] = useState(false);
  useEffect(() => {
    const text = splitNearMe(what.trim()).query ?? "";
    if (text.length < 2) {
      setMatches([]);
      setMatching(false);
      return;
    }
    const controller = new AbortController();
    setMatching(true);
    const timer = window.setTimeout(() => {
      const qs = new URLSearchParams({ q: text, page_size: "5", track: "false" });
      fetch(`/api/explore/search?${qs.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : null))
        .then((body) => setMatches(body?.items ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setMatches([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setMatching(false);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [what]);

  function submit(overrides: Partial<SearchSubmit> = {}): void {
    const split = splitNearMe(what.trim() || undefined);
    onSearch({ q: split.query ?? "", where: place.trim(), nearMe: split.nearMe, ...overrides });
  }

  const whatOptions = useMemo<Option[]>(() => {
    const text = (splitNearMe(what.trim()).query ?? "").toLowerCase();
    if (text.length === 0) {
      // Empty box: saved searches first, then recent ones not already saved.
      const savedQueries = new Set(history.saved.map((e) => e.query));
      const options: Option[] = [
        ...history.saved.slice(0, 5).map((entry) => ({
          key: `saved-${entry.query}`,
          label: entry.label,
          hint: t("search.saved"),
          icon: <Bookmark className="size-4" aria-hidden="true" />,
          run: () => onHistory(entry.query),
        })),
        ...history.recent
          .filter((entry) => !savedQueries.has(entry.query))
          .map((entry) => ({
            key: `recent-${entry.query}`,
            label: entry.label,
            hint: t("search.recent"),
            icon: <History className="size-4" aria-hidden="true" />,
            run: () => onHistory(entry.query),
          })),
      ];
      if (history.recent.length > 0) {
        options.push({
          key: "clear-recent",
          label: t("search.clearRecent"),
          icon: <Trash2 className="size-4" aria-hidden="true" />,
          run: () => clearRecent(),
        });
      }
      return options;
    }
    const options: Option[] = [
      {
        key: "search",
        label: t("search.searchFor", { text: what.trim() }),
        hint: t("search.searchForHint"),
        icon: <Search className="size-4" aria-hidden="true" />,
        run: () => submit(),
      },
    ];
    // Either language finds a trade, accents optional: "plomb" and "plumb" both
    // suggest Plumbers, "electr" finds Électriciens.
    const folded = foldAccents(text);
    const matching = categories.filter((c) =>
      categoryNames(c.slug, c.name).some((name) => foldAccents(name).includes(folded)),
    );
    for (const category of matching.slice(0, 4)) {
      options.push({
        key: `category-${category.slug}`,
        label: categoryName(category.slug, category.name, locale),
        hint: t("search.categoryHint"),
        icon: <CategoryIcon slug={category.slug} className="size-4" />,
        run: () => {
          setWhat("");
          onCategory(category.slug);
        },
      });
    }
    for (const business of matches) {
      options.push({
        key: `business-${business.id}`,
        label: business.name,
        hint: `${categoryName(business.category_slug, business.category_name, locale)} · ${business.city}`,
        icon: <Building2 className="size-4" aria-hidden="true" />,
        run: () => onBusiness(business.slug),
      });
    }
    return options;
    // submit() reads `what` and `place`, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, place, categories, matches, history, onCategory, onBusiness, onHistory, t, locale]);

  const whereOptions = useMemo<Option[]>(() => {
    const text = place.trim();
    const options: Option[] = [
      {
        key: "near-me",
        label: t("search.useLocation"),
        hint: t("search.useLocationHint"),
        icon: <LocateFixed className="size-4" aria-hidden="true" />,
        run: () => {
          setPlace("");
          onNearMe();
        },
      },
    ];
    if (looksLikePostal(text)) {
      const postal = normalisePostal(text);
      options.push({
        key: "postal",
        label: t("search.postal", { postal }),
        hint: postal.length <= 3 ? t("search.postalArea") : t("search.postalPrefix"),
        icon: <Hash className="size-4" aria-hidden="true" />,
        run: () => {
          setPlace(postal);
          submit({ where: postal });
        },
      });
    }
    const lower = text.toLowerCase();
    for (const city of cities.filter((c) => lower === "" || c.city.toLowerCase().includes(lower)).slice(0, 6)) {
      options.push({
        key: `city-${city.city}`,
        label: `${city.city}, ${city.province}`,
        icon: <MapPin className="size-4" aria-hidden="true" />,
        run: () => {
          setPlace(city.city);
          submit({ where: city.city });
        },
      });
    }
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, what, cities, onNearMe, t]);

  return (
    <form
      role="search"
      aria-label={t("search.heading")}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        "grid gap-2 rounded-card border border-line bg-surface p-2 shadow-raised md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]",
        size === "lg" && "p-3 shadow-overlay",
      )}
    >
      <Combo
        label={t("search.what")}
        placeholder={t("search.whatPlaceholder")}
        icon={<Search className="size-4" aria-hidden="true" />}
        value={what}
        onChange={setWhat}
        options={whatOptions}
        busy={matching}
        onEnter={() => submit()}
        openOnFocus
        size={size}
      />
      <Combo
        label={t("search.where")}
        placeholder={
          locating
            ? t("search.locating")
            : usingLocation
              ? t("search.whereNear")
              : t("search.wherePlaceholder")
        }
        icon={
          usingLocation ? (
            <LocateFixed className="size-4 text-brand-700" aria-hidden="true" />
          ) : (
            <MapPin className="size-4" aria-hidden="true" />
          )
        }
        value={place}
        onChange={setPlace}
        options={whereOptions}
        busy={locating}
        onEnter={() => submit()}
        openOnFocus
        size={size}
      />
      <Button type="submit" size="lg" className={cn("w-full md:w-auto", size === "lg" && "h-12")}>
        <Search aria-hidden="true" />
        {t("search.submit")}
      </Button>
    </form>
  );
}

function Combo({
  label,
  placeholder,
  icon,
  value,
  onChange,
  options,
  busy,
  onEnter,
  openOnFocus = false,
  size,
}: {
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  busy: boolean;
  onEnter: () => void;
  openOnFocus?: boolean;
  size: "md" | "lg";
}): JSX.Element {
  const { t } = useExploreT();
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => setActive(-1), [options]);

  const visible = open && options.length > 0;

  function pick(option: Option): void {
    setOpen(false);
    setActive(-1);
    option.run();
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={128}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (openOnFocus || value.trim() !== "") setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (options.length === 0 ? -1 : (i + 1) % options.length));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => (options.length === 0 ? -1 : (i <= 0 ? options.length : i) - 1));
          } else if (event.key === "Escape") {
            if (visible) {
              event.preventDefault();
              setOpen(false);
            }
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (visible && active >= 0) pick(options[active]);
            else {
              setOpen(false);
              onEnter();
            }
          }
        }}
        className={cn(
          "w-full rounded-input border border-transparent bg-surface-muted pl-9 pr-9 text-body text-ink placeholder:text-ink-muted",
          "focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          size === "lg" ? "h-12" : "h-11",
        )}
      />
      {value !== "" ? (
        <button
          type="button"
          aria-label={t("search.clear", { field: label })}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-pill text-ink-subtle hover:bg-surface hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}

      <ul
        id={listId}
        role="listbox"
        // Chrome makes a scrollable box keyboard-focusable; this one closes on
        // blur, so Tab would land on it and fall through to <body>.
        tabIndex={-1}
        aria-label={t("search.suggestions", { field: label })}
        hidden={!visible}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-overlay"
      >
        {options.map((option, index) => (
          <li
            key={option.key}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // mousedown, not click: click fires after the input's blur has
            // already closed the list.
            onMouseDown={(event) => {
              event.preventDefault();
              pick(option);
            }}
            onMouseEnter={() => setActive(index)}
            className={cn(
              "flex cursor-pointer items-center gap-3 px-3 py-2",
              index === active ? "bg-brand-50" : "hover:bg-surface-muted",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-input bg-surface-muted text-ink-muted">
              {option.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body text-ink">{option.label}</span>
              {option.hint ? (
                <span className="block truncate text-meta text-ink-muted">{option.hint}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
