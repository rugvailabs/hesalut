"use client";

/**
 * /explore: the search bar and nothing else. A search starts fresh - earlier
 * filters are cleared - and goes to /explore/results, where it can be
 * narrowed. Typed or spoken text goes through smart search first, so
 * "plumber in Burnaby open now" arrives as those filters.
 */

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Alert } from "@/components/ds/feedback";
import { useExploreT } from "@/components/explore/ExploreProviders";
import SearchBar, { type SearchSubmit } from "@/components/explore/SearchBar";
import { useExplore } from "@/components/explore/state";
import { useLocate } from "@/components/explore/useLocate";
import { useSmartSearch } from "@/components/explore/useSmartSearch";
import { EMPTY_SELECTION, fromPageQuery, toPageQuery, type ExploreSelection } from "@/lib/explore";
import type { Category, CityCount } from "@/lib/types";

export default function DashboardSearch({
  categories,
  cities,
}: {
  categories: Category[];
  cities: CityCount[];
}): JSX.Element {
  const { t } = useExploreT();
  const router = useRouter();
  const { replace, setSmart } = useExplore();
  const { locate, locating, error } = useLocate();
  const known = useMemo(
    () => ({ categories: categories.map((c) => c.slug), cities: cities.map((c) => c.city) }),
    [categories, cities],
  );
  const { search, cancel, pending } = useSmartSearch(known);

  const show = useCallback(
    (selection: ExploreSelection, nearMe: boolean) => {
      replace(selection);
      if (nearMe) {
        // "plumber near me": keep the rest, then find the visitor.
        locate(() => router.push("/explore/results"));
        return;
      }
      const qs = toPageQuery(selection);
      router.push(qs ? `/explore/results?${qs}` : "/explore/results");
    },
    [locate, replace, router],
  );

  /** A picked suggestion already says what it means: no smart search. */
  const pick = useCallback(
    (selection: ExploreSelection, nearMe = false) => {
      cancel();
      setSmart(null);
      show(selection, nearMe);
    },
    [cancel, setSmart, show],
  );

  const onSearch = useCallback(
    (submit: SearchSubmit) => search(submit, EMPTY_SELECTION, show),
    [search, show],
  );

  return (
    <div className="flex min-h-[60vh] flex-col justify-center">
      <h1 className="sr-only">{t("search.heading")}</h1>
      <div className="mx-auto w-full max-w-4xl">
        <SearchBar
          size="lg"
          q=""
          where=""
          usingLocation={false}
          locating={locating}
          categories={categories}
          cities={cities}
          onSearch={onSearch}
          understanding={pending !== null}
          onCategory={(slug) => pick({ ...EMPTY_SELECTION, categories: [slug] })}
          onNearMe={() => pick(EMPTY_SELECTION, true)}
          onBusiness={(slug) => {
            cancel();
            router.push(`/business/${slug}`);
          }}
          onHistory={(query) => {
            cancel();
            setSmart(null);
            replace(fromPageQuery(new URLSearchParams(query)));
            router.push(`/explore/results?${query}`);
          }}
        />
        {error !== null ? (
          <Alert tone="warning" className="mt-3">
            {t(error)}
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
