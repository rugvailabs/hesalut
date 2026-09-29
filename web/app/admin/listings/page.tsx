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
import type {
  BusinessStatus,
  ModerationQueueItem,
  ModerationStats,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS: { status: BusinessStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Live" },
  { status: "rejected", label: "Rejected" },
  { status: "suspended", label: "Suspended" },
];

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
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the moderation queue.";
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Listing moderation
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Approve a listing to make it visible in public search. Rejecting or
        suspending takes a reason, which the owner sees on their dashboard.
      </p>

      <div className="mt-5">
        <AdminNav current="listings" pendingListings={stats?.pending ?? 0} />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {TABS.map((tab) => {
          const count = stats?.[tab.status] ?? 0;
          const selected = tab.status === active;
          return (
            <Link
              key={tab.status}
              href={`/admin/listings?status=${tab.status}`}
              aria-current={selected ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                selected
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label} ({count})
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {error !== null ? (
          <Alert tone="error" title="Could not load the queue">
            {error}
          </Alert>
        ) : (
          // Keyed on the filter so switching tabs rebuilds the list rather
          // than reusing the previous tab's optimistic state.
          <ModerationQueue key={active} items={items} />
        )}
      </div>
    </div>
  );
}
