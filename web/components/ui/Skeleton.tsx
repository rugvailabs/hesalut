/**
 * Placeholder blocks shown while a Server Component streams.
 *
 * Skeletons mirror the shape of what is coming - a card grid stays a card
 * grid - so the layout does not jump when the real content lands. They are
 * aria-hidden and sit inside a container labelled "Loading", so a screen
 * reader hears one announcement rather than a dozen meaningless boxes.
 */

export function Skeleton({ className = "" }: { className?: string }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-line/80 ${className}`.trim()}
    />
  );
}

/** Wraps a set of skeletons with the one announcement they should make. */
export function SkeletonRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A business/listing card placeholder. */
export function CardSkeleton(): JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-5/6" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-16" />
      </div>
    </div>
  );
}

/** A table row placeholder, for the leads inbox. */
export function RowSkeleton(): JSX.Element {
  return (
    <div className="flex items-start gap-4 border-b border-line py-3">
      <Skeleton className="h-5 w-16 flex-none rounded-full" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="hidden h-4 w-32 flex-none sm:block" />
      <Skeleton className="hidden h-4 w-24 flex-none sm:block" />
    </div>
  );
}
