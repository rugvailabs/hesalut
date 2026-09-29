"use client";

/**
 * Click-a-point-on-the-map latitude/longitude picker.
 *
 * Shares the Leaflet setup from the public detail page but needs a click
 * handler, so it is its own component rather than a prop on MapView - keeping
 * MapView free of form concerns means the search page can still reuse it.
 *
 * Defaults to downtown Vancouver, which is where the seeded catalogue lives.
 */

import "leaflet/dist/leaflet.css";

import L from "leaflet";

import { tFor, type Locale } from "@/lib/i18n";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

/** Downtown Vancouver - the seeded test area. */
export const VANCOUVER: [number, number] = [49.2827, -123.1207];

const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#0f172a"/>
    <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
  </svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
});

/** Invisible child component: useMapEvents must live inside MapContainer. */
function ClickCapture({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}): null {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({
  latitude,
  longitude,
  onPick,
  locale = "en",
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
  /** Used by the Google picker's address lookup; OpenStreetMap has no geocoder here. */
  addressQuery?: string;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const hasPoint = latitude !== null && longitude !== null;
  const centre: [number, number] = hasPoint
    ? [latitude as number, longitude as number]
    : VANCOUVER;

  return (
    <div>
      <MapContainer
        center={centre}
        zoom={hasPoint ? 15 : 12}
        scrollWheelZoom={false}
        className="h-64 w-full rounded-card"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ClickCapture onPick={onPick} />
        {hasPoint ? (
          <Marker position={[latitude as number, longitude as number]} icon={pinIcon} />
        ) : null}
      </MapContainer>
      <p className="mt-1 text-meta text-ink-subtle">
        {hasPoint
          ? t("discover.map.osmPinAt", {
              lat: (latitude as number).toFixed(5),
              lng: (longitude as number).toFixed(5),
            })
          : t("discover.map.osmEmpty")}
      </p>
    </div>
  );
}
