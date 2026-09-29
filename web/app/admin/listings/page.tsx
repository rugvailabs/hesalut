/**
 * Listing moderation queue.
 *
 * Moved off /admin (now the overview) so the queue has room and its own URL.
 * The status filter lives in the query string, so a particular view is
 * linkable - "here are the suspended ones" is a shareable link.
 */

import Link from "next/link";

import AdminNav from "@/components/AdminNav";
import ModerationQueue from "@/components/ModerationQueue";
import Alert from "@/components/ui/Alert";
import { ApiError, getModerationQueue, getModerationStats } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type {
  BusinessStatus,
  ModerationQueueItem,
  ModerationStats,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// Labels are admin.listings.tabs.<status>.
const TABS: BusinessStatus[] = ["pending", "approved", "rejected", "suspended"];

function isStatus(value: string | undefined): value is BusinessStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  );
}

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireAdmin("/admin/listings");

  const active: BusinessStatus = isStatus(searchParams.status)
    ? searchParams.status
    : "pending";

  let items: ModerationQueueItem[] = [];
  let stats: ModerationStats | null = null;
  let error: string | null = null;

  try {
    [items, stats] = await Promise.all([
      getModerationQueue(active, { limit: 100 }),
      getModerationStats(),
    ]);
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("admin.common.apiUnreachable")
          : cause.message
        : t("admin.listings.loadError");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {t("admin.listings.title")}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {t("admin.listings.intro")}
      </p>

      <div className="mt-5">
        <AdminNav
          current="listings"
          pendingListings={stats?.pending ?? 0}
          locale={locale}
        />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={t("admin.listings.filterLabel")}>
        {TABS.map((status) => {
          const count = stats?.[status] ?? 0;
          const selected = status === active;
          return (
            <Link
              key={status}
              href={`/admin/listings?status=${status}`}
              aria-current={selected ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                selected
                  ? "bg-ink text-ink-inverse"
                  : "border border-line-strong bg-surface text-ink hover:bg-surface-muted"
              }`}
            >
              {t("admin.listings.tabCount", {
                label: t(`admin.listings.tabs.${status}`),
                count: count.toLocaleString(INTL_LOCALE[locale]),
              })}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {error !== null ? (
          <Alert locale={locale} tone="error" title={t("admin.listings.loadErrorTitle")}>
            {error}
          </Alert>
        ) : (
          // Keyed on the filter so switching tabs rebuilds the list rather
          // than reusing the previous tab's optimistic state.
          <ModerationQueue key={active} items={items} locale={locale} />
        )}
      </div>
    </div>
  );
}
