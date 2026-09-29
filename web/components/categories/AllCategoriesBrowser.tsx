"use client";

/**
 * The filtering half of the All Categories page.
 *
 * The source split this across AllCategories, PopularChips, AlphaIndex and
 * CategoryGrid. Three of those four only exist to render state this component
 * owns, and in the App Router every one of them would have to be a client
 * component anyway - so they are kept as functions in this file rather than as
 * four modules with a "use client" directive each. The page above is a Server
 * Component and does the fetching.
 *
 * THE FILTER RULE, unchanged from the reference because it is correct: search,
 * letter and chip are mutually exclusive - setting any one clears the other
 * two. Two filters stacking is how somebody lands on an empty grid with no
 * idea which control emptied it. The empty state names the active filter and
 * clears it in one click.
 *
 * Search matches the category name only. The source also searched a
 * `subcategories` array; ours has none - every category in this taxonomy is
 * top-level - so searching it would be searching an empty list.
 */

import { useMemo, useState } from "react";

import CategoryCard from "@/components/categories/CategoryCard";
import { Button } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";

// split("") rather than the source's spread: this project targets a lower
// ES level, where spreading a string needs downlevelIteration.
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export interface BrowseCategory {
  id: number;
  name: string;
  slug: string;
  /** Listings in THIS city, not the global count. */
  count: number;
  href: string;
}

export default function AllCategoriesBrowser({
  categories,
  cityLabel,
  popular,
  locale = "en",
}: {
  categories: readonly BrowseCategory[];
  cityLabel: string;
  /** Slugs of the busiest categories, chosen server-side. */
  popular: readonly string[];
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [chip, setChip] = useState("");

  const available = useMemo(
    () => new Set(categories.map((c) => c.name[0]?.toUpperCase() ?? "")),
    [categories],
  );

  const popularCategories = useMemo(
    () =>
      popular
        .map((slug) => categories.find((c) => c.slug === slug))
        .filter((c): c is BrowseCategory => c !== undefined),
    [popular, categories],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (chip && c.slug !== chip) return false;
      if (letter && c.name[0]?.toUpperCase() !== letter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [categories, query, letter, chip]);

  const reset = (): void => {
    setQuery("");
    setLetter("");
    setChip("");
  };

  /** What the empty state should name as the reason nothing matched. */
  const activeFilter =
    query.trim() ||
    (letter ? t("discover.categories.theLetter", { letter }) : "") ||
    (chip ? (categories.find((c) => c.slug === chip)?.name ?? chip) : "");

  return (
    <>
      {/* --- search ---------------------------------------------------- */}
      <div className="mb-4">
        <label htmlFor="category-search" className="sr-only">
          {t("discover.categories.searchLabel")}
        </label>
        <input
          id="category-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLetter("");
            setChip("");
          }}
          placeholder={t("discover.categories.searchPlaceholder")}
          className="h-10 w-full max-w-md rounded-input border border-line-strong bg-surface px-3 text-body text-ink
                     placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      {/* --- popular chips --------------------------------------------- */}
      {popularCategories.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-3.5 py-3">
          <span className="mr-0.5 text-micro uppercase text-ink-subtle">
            {t("discover.categories.popularIn", { city: cityLabel })}
          </span>
          {popularCategories.map((category) => {
            const on = chip === category.slug;
            return (
              <button
                key={category.slug}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setChip(on ? "" : category.slug);
                  setLetter("");
                  setQuery("");
                }}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-body font-medium transition",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  "focus-visible:outline-ring motion-reduce:transition-none",
                  on
                    ? "border-brand-700 bg-brand-700 text-ink-inverse"
                    : "border-line-strong text-ink-muted hover:border-brand-600 hover:text-brand-700",
                )}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid items-start gap-5 [grid-template-columns:56px_minmax(0,1fr)] max-[900px]:[grid-template-columns:minmax(0,1fr)]">
        {/* --- A-Z rail ------------------------------------------------ */}
        <aside
          aria-label={t("discover.categories.jumpToLetter")}
          className="sticky top-[122px] grid justify-items-center gap-px rounded-card border border-line bg-surface px-1 py-2
                     max-[900px]:static max-[900px]:grid-flow-col max-[900px]:justify-start max-[900px]:overflow-x-auto"
        >
          {LETTERS.map((L) => {
            const has = available.has(L);
            const on = letter === L;
            return (
              <button
                key={L}
                type="button"
                disabled={!has}
                aria-pressed={on}
                aria-label={
                  has
                    ? t("discover.categories.startingWith", { letter: L })
                    : t("discover.categories.noneStartingWith", { letter: L })
                }
                onClick={() => {
                  setLetter(on ? "" : L);
                  setChip("");
                  setQuery("");
                }}
                className={cn(
                  "h-6 w-[30px] rounded-input text-meta tabular leading-6",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                  "focus-visible:outline-ring",
                  on
                    ? "bg-brand-700 text-ink-inverse"
                    : "text-ink-muted hover:bg-brand-50 hover:text-brand-800",
                  // Disabled letters stay in the DOM at 30% so the alphabet
                  // keeps its shape and the eye can still target M by position.
                  has ? "" : "cursor-default opacity-30 hover:bg-transparent",
                )}
              >
                {L}
              </button>
            );
          })}
          <button
            type="button"
            onClick={reset}
            title={t("empty.clearFilters")}
            aria-label={t("empty.clearFilters")}
            className="h-6 w-[30px] rounded-input text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            ×
          </button>
        </aside>

        {/* --- grid ---------------------------------------------------- */}
        <div>
          <p className="mb-3 text-meta tabular text-ink-subtle" role="status" aria-live="polite">
            {t(
              categories.length === 1
                ? "discover.categories.showingOne"
                : "discover.categories.showingMany",
              {
                shown: formatCount(visible.length, intl),
                total: formatCount(categories.length, intl),
              },
            )}
          </p>

          {visible.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong px-4 py-10 text-center text-ink-muted">
              <b className="mb-1 block font-semibold text-ink">
                {activeFilter
                  ? t("discover.categories.noMatchFilter", { filter: activeFilter })
                  : t("discover.categories.noMatch")}
              </b>
              <Button variant="link" size="sm" onClick={reset} className="h-auto px-1">
                {t("discover.categories.clearFilter")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(174px,1fr))] max-[560px]:gap-2.5 max-[560px]:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {visible.map((category) => (
                <CategoryCard
                  key={category.id}
                  name={category.name}
                  slug={category.slug}
                  count={category.count}
                  href={category.href}
                  cityLabel={cityLabel}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
