/**
 * Search skeleton.
 *
 * Mirrors the three-column layout the page settled on - filter rail, results,
 * map - rather than the two-column grid that preceded it, so nothing shifts
 * when the results land. ListingListSkeleton is the same geometry ListingCard
 * renders into.
 */

import { ListingListSkeleton, Skeleton } from "@/components/ds/feedback";
import { Card } from "@/components/ds/primitives";

export default function SearchLoading(): JSX.Element {
  return (
    <>
      {/* @ts-expect-error Async Server Component in a sync parent - allowed in
          the App Router, not yet expressible in the type system. */}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-4 h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-40" />

        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr] xl:grid-cols-[16rem_1fr_20rem]">
          <Card className="hidden h-96 space-y-4 p-4 lg:block">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-10 w-full rounded-input" />
              </div>
            ))}
          </Card>

          <ListingListSkeleton count={5} label="Loading search results" />

          <Skeleton className="hidden h-96 rounded-card xl:block" />
        </div>
      </main>
    </>
  );
}
