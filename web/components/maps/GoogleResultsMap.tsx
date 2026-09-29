"use client";

/**
 * Google Maps for the search results: one pin per listing with coordinates,
 * plus the searcher's own position on a "near me" search.
 *
 * The Google counterpart of ResultsMapView; ResultsMap picks between them.
 * Listings without coordinates are not on the map - the caption under it on
 * the search page says how many are.
 */

import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";

import { formatDistance, formatLocality, formatRating } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import {
  GOOGLE_MAP_ID,
  GOOGLE_MAPS_API_KEY,
  PIN_BORDER,
  PIN_COLOUR,
  VANCOUVER,
} from "@/lib/maps";
import type { BusinessListItem } from "@/lib/types";

type Point = { lat: number; lng: number };
type Mapped = BusinessListItem & { latitude: number; longitude: number };

/** Frame every pin (and the searcher), re-running when the set changes. */
function FitBounds({ points }: { points: Point[] }): null {
  const map = useMap();
  // Serialised: `points` is a fresh array every render, so comparing by
  // identity would refit continuously and by length would miss page 2.
  const key = JSON.stringify(points);

  useEffect(() => {
    if (!map) return;
    const framed: Point[] = JSON.parse(key);
    if (framed.length === 0) return;
    if (framed.length === 1) {
      map.setCenter(framed[0]);
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const point of framed) bounds.extend(point);
    map.fitBounds(bounds, 48);
    // fitBounds on two pins a street apart zooms to building level.
    const listener = google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
    });
    return () => listener.remove();
  }, [map, key]);

  return null;
}

export default function GoogleResultsMap({
  businesses,
  origin,
  className = "",
  locale = "en",
}: {
  businesses: BusinessListItem[];
  /** The searcher's position on a near-me search. */
  origin?: Point;
  className?: string;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const mapped = businesses.filter(
    (business): business is Mapped =>
      business.latitude !== null && business.longitude !== null,
  );
  const selected = mapped.find((business) => business.id === selectedId) ?? null;

  const points: Point[] = mapped.map((business) => ({
    lat: business.latitude,
    lng: business.longitude,
  }));
  if (origin) points.push(origin);

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <Map
        mapId={GOOGLE_MAP_ID}
        defaultCenter={points[0] ?? VANCOUVER}
        defaultZoom={points.length > 0 ? 13 : 11}
        gestureHandling="cooperative"
        streetViewControl={false}
        mapTypeControl={false}
        className={className}
        style={{ height: "100%", width: "100%" }}
        onClick={() => setSelectedId(null)}
      >
        <FitBounds points={points} />

        {origin ? (
          <AdvancedMarker position={origin} title={t("discover.map.yourLocation")} zIndex={1000}>
            <span
              className="block size-4 rounded-full border-2 border-white bg-[#1a73e8] shadow-[0_0_0_6px_rgba(26,115,232,0.25)]"
              aria-hidden="true"
            />
          </AdvancedMarker>
        ) : null}

        {mapped.map((business) => (
          <AdvancedMarker
            key={business.id}
            position={{ lat: business.latitude, lng: business.longitude }}
            title={business.name}
            onClick={() => setSelectedId(business.id)}
          >
            <Pin
              background={business.id === selectedId ? PIN_BORDER : PIN_COLOUR}
              borderColor={PIN_BORDER}
              glyphColor="#ffffff"
              scale={business.id === selectedId ? 1.2 : 1}
            />
          </AdvancedMarker>
        ))}

        {selected !== null ? (
          <InfoWindow
            position={{ lat: selected.latitude, lng: selected.longitude }}
            pixelOffset={[0, -40]}
            onCloseClick={() => setSelectedId(null)}
          >
            <div className="max-w-[14rem] text-slate-900">
              <span className="block text-[0.8125rem] font-semibold">{selected.name}</span>
              <span className="block text-[0.75rem] text-slate-600">
                {formatLocality(selected.city, selected.province)}
                {selected.distance_km !== null
                  ? ` · ${t("listing.away", {
                      distance: formatDistance(selected.distance_km, INTL_LOCALE[locale]) ?? "",
                    })}`
                  : ""}
              </span>
              {selected.rating !== null ? (
                <span className="block text-[0.75rem]">
                  {formatRating(selected.rating)} ★ ({selected.review_count})
                </span>
              ) : null}
              <a
                href={`/business/${selected.slug}`}
                className="mt-1 block text-[0.75rem] font-medium text-[#0b5953] underline"
              >
                {t("discover.map.viewListing")}
              </a>
            </div>
          </InfoWindow>
        ) : null}
      </Map>
    </APIProvider>
  );
}
