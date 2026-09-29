/**
 * Verification skeleton: the two-gate panel, then the form.
 */

import { Skeleton, SkeletonRegion } from "@/components/ds/feedback";
import { Card } from "@/components/ds/primitives";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default function VerificationLoading(): JSX.Element {
  const t = tFor(getLocale());
  return (
    <>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />

        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-input" />
          ))}
        </div>

        <SkeletonRegion label={t("dashboard.verification.loading")} className="mt-4 space-y-4">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-5 w-56" />
            <div className="flex justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-40 rounded-pill" />
            </div>
            <div className="flex justify-between gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-44 rounded-pill" />
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full rounded-input" />
              <Skeleton className="h-10 w-full rounded-input" />
            </div>
            <Skeleton className="h-24 w-full rounded-input" />
            <Skeleton className="h-24 w-full rounded-input" />
          </Card>
        </SkeletonRegion>
      </main>
    </>
  );
}
