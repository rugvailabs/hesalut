import { RowSkeleton, Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default function VerificationsLoading(): JSX.Element {
  const t = tFor(getLocale());
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-96" />
      <SkeletonRegion label={t("admin.verifications.loading")}>
        <div className="mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
