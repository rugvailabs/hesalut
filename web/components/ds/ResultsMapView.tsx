"use client";

/**
 * The results map: one pin per listing that has coordinates.
 *
 * A separate component from MapView, which pins exactly one point for the
 * profile page. Sharing them would mean a props shape that is half-ignored in
 * each case.
 *
 * Leaflet touches `window` at import time, so this can never be
 * server-rendered - ResultsMap pulls it in with ssr:false.
 *
 * Listings without coordinates are simply not on the map. They are still in
 * the list beside it, and the count says so, because a map that silently drops
 * results is worse than one that admits it shows fewer.
 */

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { useEffect } from "react";

import { formatLocality, formatRating } from "@/lib/format";
import { tFor, type Locale } from "@/lib/i18n";
import type { BusinessListItem } from "@/lib/types";

/**
 * A divIcon rather than Leaflet's default marker: the stock icon resolves its
 * PNG by a URL relative to the CSS, which bundlers rewrite and Leaflet then
 * 404s on - the classic invisible-markers bug. Inline SVG has no asset to lose.
 *
 * Filled with the brand token's literal value because this string is handed to
 * Leaflet, not to Tailwind, and a class name would never be compiled.
 */
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="26" height="36" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#0f756d"/>
    <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
  </svg>`,
  iconSize: [26, 36],
  // Anchor at the tip of the pin, not its centre, or it points slightly north.
  iconAnchor: [13, 36],
  popupAnchor: [0, -32],
});

/** Frame every pin, re-running when the result set changes. */
function FitBounds({ points }: { points: [number, number][] }): null {
  const map = useMap();
  // Serialised into the dependency: `points` is a fresh array on every render,
  // so comparing it by identity would refit the map continuously, and
  // comparing by length would miss page 2 of the same-sized result set.
  const key = JSON.stringify(points);

  useEffect(() => {
    const framed: [number, number][] = JSON.parse(key);
    if (framed.length === 0) return;
    if (framed.length === 1) {
      map.setView(framed[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(framed), { padding: [32, 32], maxZoom: 15 });
  }, [map, key]);

  return null;
}

export default function ResultsMapView({
  businesses,
  origin,
  className = "",
  locale = "en",
}: {
  businesses: BusinessListItem[];
  /** The searcher's position on a near-me search. */
  origin?: { lat: number; lng: number };
  className?: string;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const mapped = businesses.filter(
    (business): business is BusinessListItem & { latitude: number; longitude: number } =>
      business.latitude !== null && business.longitude !== null,
  );

  const points: [number, number][] = mapped.map((business) => [
    business.latitude,
    business.longitude,
  ]);
  if (origin) points.push([origin.lat, origin.lng]);

  // Downtown Vancouver, which is where the directory's data actually is. Only
  // used for the frame before FitBounds runs, or when nothing has coordinates.
  const fallback: [number, number] = [49.2827, -123.1207];

  return (
    <MapContainer
      center={points[0] ?? fallback}
      zoom={points.length > 0 ? 13 : 11}
      scrollWheelZoom={false}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />

      {origin ? (
        <CircleMarker
          center={[origin.lat, origin.lng]}
          radius={7}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#1a73e8", fillOpacity: 1 }}
        >
          <Popup>{t("discover.map.yourLocation")}</Popup>
        </CircleMarker>
      ) : null}

      {mapped.map((business) => (
        <Marker
          key={business.id}
          position={[business.latitude, business.longitude]}
          icon={pinIcon}
        >
          <Popup>
            <span className="block text-[0.8125rem] font-semibold">
              {business.name}
            </span>
            <span className="block text-[0.75rem] text-ink-muted">
              {formatLocality(business.city, business.province)}
            </span>
            {business.rating !== null ? (
              <span className="block text-[0.75rem]">
                {formatRating(business.rating)} ★ ({business.review_count})
              </span>
            ) : null}
            <a
              href={`/business/${business.slug}`}
              className="mt-1 block text-[0.75rem] font-medium underline"
            >
              {t("discover.map.viewListing")}
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
