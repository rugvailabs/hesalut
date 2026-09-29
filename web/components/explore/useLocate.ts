"use client";

/**
 * Ask the browser where the visitor is, and store it as the "near me" point.
 *
 * Errors come back as i18n keys, so they show in whichever language is
 * current when they are displayed rather than when they happened.
 */

import { useCallback, useState } from "react";

import { useExplore } from "@/components/explore/state";

export type LocateError = "geo.unsupported" | "geo.denied" | "geo.failed";

export function useLocate(): {
  /** `onFound` runs after the point is stored - e.g. to go to the results. */
  locate: (onFound?: () => void) => void;
  locating: boolean;
  error: LocateError | null;
} {
  const { setNear } = useExplore();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocateError | null>(null);

  const locate = useCallback((onFound?: () => void) => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("geo.unsupported");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        onFound?.();
      },
      (failure) => {
        setLocating(false);
        setError(failure.code === failure.PERMISSION_DENIED ? "geo.denied" : "geo.failed");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [setNear]);

  return { locate, locating, error };
}
