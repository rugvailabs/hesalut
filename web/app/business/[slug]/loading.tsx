/**
 * Profile skeleton.
 *
 * Matches the real page's geometry - breadcrumb, title block, action strip,
 * then the two-column split - so the swap when data lands does not jump. The
 * header is the real one: it does not depend on the listing, so rendering a
 * grey bar in its place would be a downgrade.
 */

import { Skeleton as Bar } from "@/components/ds/feedback";
import { Card } from "@/components/ds/primitives";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default function Loading(): JSX.Element {
  const t = tFor(getLocale());
  return (
    <>
      <main
        className="mx-auto max-w-6xl px-4 py-6 sm:px-6"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">{t("discover.business.loading")}</span>

        <Bar className="h-3 w-56" />
        <Bar className="mt-4 h-8 w-2/5" />
        <Bar className="mt-2 h-3 w-1/3" />
        <Bar className="mt-3 h-4 w-40" />

        <div className="mt-4 flex gap-2 border-y border-line py-3">
          <Bar className="h-10 w-36 rounded-input" />
          <Bar className="h-10 w-28 rounded-input" />
          <Bar className="h-10 w-28 rounded-input" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Bar className="h-10 w-64 rounded-input" />
            <div>
              <Bar className="h-5 w-24" />
              <Bar className="mt-2 h-3 w-full" />
              <Bar className="mt-1.5 h-3 w-4/5" />
            </div>
            <div>
              <Bar className="h-5 w-28" />
              <Card className="mt-2 p-4">
                <Bar className="h-3 w-2/5" />
                <Bar className="mt-2 h-3 w-1/3" />
                <Bar className="mt-3 h-64 w-full rounded-card" />
              </Card>
            </div>
          </div>

          <Card className="h-64 p-4 lg:col-span-1">
            <Bar className="h-3 w-20" />
            <Bar className="mt-4 h-3 w-24" />
            <Bar className="mt-1.5 h-3 w-32" />
            <Bar className="mt-4 h-3 w-24" />
            <Bar className="mt-1.5 h-3 w-40" />
          </Card>
        </div>
      </main>
    </>
  );
}
