"use client";

/**
 * Loads the results map with SSR disabled.
 *
 * next/dynamic with ssr:false is only allowed inside a Client Component, so
 * this shim exists to keep the search page itself a Server Component. It also
 * picks the provider: Google Maps when a key is configured, Leaflet otherwise.
 */

import dynamic from "next/dynamic";

import { translate, type Locale } from "@/lib/i18n";
import { hasGoogleMaps } from "@/lib/maps";
import type { BusinessListItem } from "@/lib/types";

type Props = {
  businesses: BusinessListItem[];
  /** The searcher's position on a near-me search. */
  origin?: { lat: number; lng: number };
  className?: string;
  locale?: Locale;
};

function Placeholder({ locale }: { locale: Locale }): JSX.Element {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-surface-muted text-meta text-ink-muted"
      role="status"
    >
      {translate(locale, "discover.map.loading")}
    </div>
  );
}

// One loader per language: next/dynamic's `loading` receives no props, so the
// placeholder's words are fixed when the loader is declared. Both are
// top-level calls, which is what next/dynamic requires.
const ResultsMapViewEn = dynamic<Props>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GoogleResultsMap")
      : import("@/components/ds/ResultsMapView"),
  { ssr: false, loading: () => <Placeholder locale="en" /> },
);

const ResultsMapViewFr = dynamic<Props>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GoogleResultsMap")
      : import("@/components/ds/ResultsMapView"),
  { ssr: false, loading: () => <Placeholder locale="fr" /> },
);

export default function ResultsMap(props: Props): JSX.Element {
  const View = props.locale === "fr" ? ResultsMapViewFr : ResultsMapViewEn;
  return <View {...props} />;
}
