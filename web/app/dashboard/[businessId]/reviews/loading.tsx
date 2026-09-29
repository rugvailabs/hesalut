/**
 * Reviews skeleton: the breakdown panel, then the review cards.
 */

import { Skeleton, SkeletonRegion } from "@/components/ds/feedback";
import { Card } from "@/components/ds/primitives";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default function ReviewsLoading(): JSX.Element {
  const t = tFor(getLocale());
  return (
    <>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-80" />
        <Skeleton className="mt-2 h-4 w-56" />

        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-input" />
          ))}
        </div>

        <SkeletonRegion label={t("dashboard.reviews.loading")} className="mt-4 space-y-3">
          <Card className="flex gap-8 p-4">
            <Skeleton className="h-12 w-16" />
            <div className="flex-1 space-y-1.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-2.5 w-full rounded-pill" />
              ))}
            </div>
          </Card>

          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-3/4" />
            </Card>
          ))}
        </SkeletonRegion>
      </main>
    </>
  );
}
