"use client";

/**
 * Client-side wrapper that loads the single-pin map with SSR disabled.
 *
 * `next/dynamic` with `ssr: false` is only allowed inside a Client Component,
 * so this thin shim exists to keep the detail page itself a Server Component.
 *
 * It is also where the provider is chosen: Google Maps when a key is
 * configured, the Leaflet/OpenStreetMap MapView otherwise (see lib/maps).
 */

import dynamic from "next/dynamic";

import { translate, type Locale } from "@/lib/i18n";
import { hasGoogleMaps } from "@/lib/maps";

type Props = {
  latitude: number;
  longitude: number;
  name: string;
  zoom?: number;
  className?: string;
};

function Placeholder({ locale }: { locale: Locale }): JSX.Element {
  return (
    <div
      className="flex h-64 w-full items-center justify-center rounded-card border border-line bg-surface-muted text-meta text-ink-muted"
      role="status"
    >
      {translate(locale, "discover.map.loading")}
    </div>
  );
}

// One loader per language: next/dynamic's `loading` receives no props, so the
// placeholder's words are fixed when the loader is declared. Both are
// top-level calls, which is what next/dynamic requires.
const MapViewEn = dynamic<Props>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GooglePinMap")
      : import("@/components/MapView"),
  { ssr: false, loading: () => <Placeholder locale="en" /> },
);

const MapViewFr = dynamic<Props>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GooglePinMap")
      : import("@/components/MapView"),
  { ssr: false, loading: () => <Placeholder locale="fr" /> },
);

export default function MapEmbed({
  locale = "en",
  ...props
}: Props & { locale?: Locale }): JSX.Element {
  // The map itself has no words of its own - the pin's label is the
  // business name - so only the loading placeholder needs the language.
  const View = locale === "fr" ? MapViewFr : MapViewEn;
  return <View {...props} />;
}
