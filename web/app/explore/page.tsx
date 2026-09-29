/**
 * /explore - the dashboard: a search bar, nothing else.
 *
 * The server fetches what the suggestions are made of (categories, and the
 * cities that have listings); the search itself and the language live on
 * the client in the providers (app/explore/layout.tsx). Results are
 * /explore/results.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";

import DashboardSearch from "@/components/explore/DashboardSearch";
import { Alert } from "@/components/ds/feedback";
import { getCategories, getCities } from "@/lib/api";
import { LANG_COOKIE } from "@/lib/explore-i18n/constants";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const fr = cookies().get(LANG_COOKIE)?.value === "fr";
  return {
    title: fr ? "Explorer les entreprises" : "Explore businesses",
    // The flow is for people, not crawlers: /search is the indexable listing.
    robots: { index: false, follow: true },
  };
}

export default async function ExploreChoosePage(): Promise<JSX.Element> {
  const [categories, cities] = await Promise.allSettled([getCategories(), getCities()]);

  if (categories.status === "rejected" && cities.status === "rejected") {
    return (
      <Alert tone="error" title="The directory is unavailable">
        Categories and cities could not be loaded. Is the API running? Reload in a moment.
      </Alert>
    );
  }

  return (
    <DashboardSearch
      categories={categories.status === "fulfilled" ? categories.value : []}
      cities={cities.status === "fulfilled" ? cities.value : []}
    />
  );
}
