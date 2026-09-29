"use client";

/**
 * /explore: the search bar and nothing else. A search starts fresh - earlier
 * filters are cleared - and goes to /explore/results, where it can be
 * narrowed.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { Alert } from "@/components/ds/feedback";
import { useExploreT } from "@/components/explore/ExploreProviders";
import SearchBar, { type SearchSubmit } from "@/components/explore/SearchBar";
import { useExplore } from "@/components/explore/state";
import { useLocate } from "@/components/explore/useLocate";
import {
  EMPTY_SELECTION,
  fromPageQuery,
  toPageQuery,
  withSearch,
  type ExploreSelection,
} from "@/lib/explore";
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
  const { replace } = useExplore();
  const { locate, locating, error } = useLocate();

  const go = useCallback(
    (selection: ExploreSelection) => {
      replace(selection);
      const qs = toPageQuery(selection);
      router.push(qs ? `/explore/results?${qs}` : "/explore/results");
    },
    [replace, router],
  );

  const onSearch = useCallback(
    ({ q, where, nearMe }: SearchSubmit) => {
      const selection = withSearch(EMPTY_SELECTION, q, where, cities.map((c) => c.city));
      if (!nearMe) {
        go(selection);
        return;
      }
      // "plumber near me": keep the words, then find the visitor.
      replace(selection);
      locate(() => router.push("/explore/results"));
    },
    [cities, go, locate, replace, router],
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
          onCategory={(slug) => go({ ...EMPTY_SELECTION, categories: [slug] })}
          onNearMe={() => {
            replace(EMPTY_SELECTION);
            locate(() => router.push("/explore/results"));
          }}
          onBusiness={(slug) => router.push(`/business/${slug}`)}
          onHistory={(query) => {
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
