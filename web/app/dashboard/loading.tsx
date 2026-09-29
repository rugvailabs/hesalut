/**
 * Listings-index skeleton.
 *
 * The header is the real one - it does not depend on the listings - so a grey
 * bar in its place would be a downgrade, not a placeholder.
 */

import { Skeleton, SkeletonRegion } from "@/components/ds/feedback";
import { Card } from "@/components/ds/primitives";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default function DashboardLoading(): JSX.Element {
  const t = tFor(getLocale());
  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />

        <SkeletonRegion label={t("dashboard.index.loading")} className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-4">
              <div className="flex justify-between gap-3">
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Skeleton className="h-5 w-20 rounded-pill" />
                  <Skeleton className="h-5 w-28 rounded-pill" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-9 w-20 rounded-input" />
                <Skeleton className="h-9 w-20 rounded-input" />
                <Skeleton className="h-9 w-24 rounded-input" />
                <Skeleton className="h-9 w-28 rounded-input" />
              </div>
            </Card>
          ))}
        </SkeletonRegion>
      </main>
    </>
  );
}
