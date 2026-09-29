/**
 * Shown while the results route loads on the server, before ResultsStep
 * takes over with its own skeletons. Same card geometry, so nothing jumps.
 */

import { ListingCardSkeleton, Skeleton } from "@/components/ds/feedback";

export default function ResultsLoading(): JSX.Element {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading results</span>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-9 w-full" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
