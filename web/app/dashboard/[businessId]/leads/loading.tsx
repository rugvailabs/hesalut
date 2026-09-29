/**
 * Leads skeleton: the four-column table, not a stack of generic cards.
 */

import { Skeleton, SkeletonRegion } from "@/components/ds/feedback";

export default function LeadsLoading(): JSX.Element {
  return (
    <>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-40" />

        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-input" />
          ))}
        </div>

        <SkeletonRegion
          label="Loading leads"
          className="mt-4 rounded-card border border-line bg-surface"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-start gap-4 border-b border-line px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-5 w-16 flex-none rounded-pill" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-32 flex-none sm:block" />
              <Skeleton className="hidden h-4 w-28 flex-none sm:block" />
            </div>
          ))}
        </SkeletonRegion>
      </main>
    </>
  );
}
