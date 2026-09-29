import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default function VerificationDetailLoading(): JSX.Element {
  const t = tFor(getLocale());
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-7 w-72" />
      <Skeleton className="mt-2 h-4 w-56" />
      <SkeletonRegion label={t("admin.verification.loading")}>
        <div className="mt-6 space-y-3 rounded-md border border-line bg-surface p-4">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
