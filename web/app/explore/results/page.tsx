/**
 * /explore/results - the businesses matching a search made on /explore.
 *
 * The search comes from the shared store, or from this URL's query string
 * when the page is opened from a shared link (see components/explore/state).
 * The server supplies the categories and cities the pills are made of.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";

import ResultsStep from "@/components/explore/ResultsStep";
import { getCategories, getCities } from "@/lib/api";
import { LANG_COOKIE } from "@/lib/explore-i18n/constants";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const fr = cookies().get(LANG_COOKIE)?.value === "fr";
  return {
    title: fr ? "Résultats" : "Results",
    robots: { index: false, follow: true },
  };
}

export default async function ExploreResultsPage(): Promise<JSX.Element> {
  // Without these the pills and suggestions are sparse; results still load.
  const [categories, cities] = await Promise.all([
    getCategories().catch(() => []),
    getCities().catch(() => []),
  ]);
  return <ResultsStep categories={categories} cities={cities} />;
}
