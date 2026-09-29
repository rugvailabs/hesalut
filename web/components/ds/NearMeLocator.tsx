"use client";

/**
 * Resolves a `near=me` search into a real point.
 *
 * Every "near me" entry point - the hero button, the header's locate button,
 * the banner, the filter rail, and "plumber near me" typed as a query - lands
 * on /search with `near=me` instead of each asking for the browser's position
 * itself. This asks once, then replaces the URL with the lat/lng/radius
 * the backend understands, so the result is still a plain shareable search
 * URL and the back button skips the locating step.
 *
 * When location is refused or unavailable it says what to do instead and
 * offers the same search without the location, rather than an empty page.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { tFor, type Locale } from "@/lib/i18n";
import { NEAR_ME_RADIUS_KM } from "@/lib/near-me";

export default function NearMeLocator({
  query,
  /** The search's other parameters, already without `near` and with `q` cleaned. */
  baseParams,
  locale = "en",
}: {
  query: string | undefined;
  baseParams: Record<string, string>;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const withoutLocation = (() => {
    const qs = new URLSearchParams(baseParams).toString();
    return qs ? `/search?${qs}` : "/search";
  })();

  const locate = useCallback(() => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t("discover.nearMe.unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = new URLSearchParams(baseParams);
        next.set("lat", position.coords.latitude.toFixed(6));
        next.set("lng", position.coords.longitude.toFixed(6));
        next.set("radius_km", String(NEAR_ME_RADIUS_KM));
        // No sort: the default ranks by plan tier, then rating, then distance.
        next.delete("page");
        router.replace(`/search?${next.toString()}`);
      },
      (failure) => {
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? t("discover.nearMe.denied")
            : t("discover.nearMe.unavailable"),
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
    // baseParams is rebuilt by the server on each navigation; its contents,
    // not its identity, are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, JSON.stringify(baseParams), locale]);

  useEffect(() => {
    locate();
  }, [locate, attempt]);

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <LocateFixed className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-card-title text-ink">
              {query
                ? t("discover.nearMe.findingQuery", { query })
                : t("discover.nearMe.finding")}
            </h2>
            {error === null ? (
              <p role="status" className="mt-1 text-body text-ink-muted">
                {t("discover.nearMe.waiting")}
              </p>
            ) : null}
          </div>

          {error !== null ? (
            <Alert tone="warning" locale={locale}>
              {error}
            </Alert>
          ) : null}

          {error !== null ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setAttempt((n) => n + 1)}>
                {t("common.retry")}
              </Button>
              <Button asChild variant="secondary">
                <Link href={withoutLocation}>{t("discover.nearMe.withoutLocation")}</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
