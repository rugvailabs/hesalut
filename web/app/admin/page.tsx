/**
 * Admin landing: the numbers, then the way in to each moderation queue.
 *
 * Stats first because an admin arrives asking "is there anything waiting?",
 * not "show me everything". The pending count is the only figure that is a
 * call to action, so it is the only one styled as one.
 */

import Link from "next/link";

import AdminNav from "@/components/AdminNav";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getAdminStats } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import type { AdminStats } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  urgent = false,
}: {
  label: string;
  value: number;
  hint?: string;
  urgent?: boolean;
}): JSX.Element {
  return (
    <Card className={urgent && value > 0 ? "border-amber-300 bg-amber-50" : undefined}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          urgent && value > 0 ? "text-amber-900" : "text-slate-900"
        }`}
      >
        {value.toLocaleString("en-CA")}
      </p>
      {hint !== undefined ? (
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </Card>
  );
}

export default async function AdminHomePage(): Promise<JSX.Element> {
  await requireAdmin("/admin");

  let stats: AdminStats | null = null;
  let error: string | null = null;
  try {
    stats = await getAdminStats();
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the admin overview.";
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Directory overview and moderation queues.
      </p>

      <div className="mt-5">
        <AdminNav
          current="overview"
          pendingListings={stats?.pending_listings}
          pendingVerifications={stats?.pending_verifications}
        />
      </div>

      {error !== null ? (
        <Alert tone="error" title="Could not load the overview">
          {error}
        </Alert>
      ) : stats !== null ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Pending review"
              value={stats.pending_listings}
              hint={stats.pending_listings > 0 ? "Waiting on you" : "Nothing waiting"}
              urgent
            />
            <Stat
              label="Awaiting verification"
              value={stats.pending_verifications}
              hint={
                stats.pending_verifications > 0
                  ? "KYC waiting on you"
                  : "Nothing waiting"
              }
              urgent
            />
            <Stat label="Live listings" value={stats.approved_listings} hint="In public search" />
            <Stat label="Total listings" value={stats.total_businesses} />
            <Stat label="Users" value={stats.total_users} />
            <Stat label="Reviews" value={stats.total_reviews} />
            <Stat label="Enquiries" value={stats.total_enquiries} />
            <Stat label="Conversations" value={stats.total_conversations} />
            <Stat
              label="Not visible"
              value={stats.rejected_listings + stats.suspended_listings}
              hint={`${stats.rejected_listings} rejected · ${stats.suspended_listings} suspended`}
            />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <h2 className="font-semibold text-slate-900">Listings</h2>
              <p className="mt-1 text-sm text-slate-600">
                Approve, reject or suspend. Approving puts a listing into public
                search.
              </p>
              <div className="mt-3">
                <ButtonLink href="/admin/listings" size="sm">
                  {stats.pending_listings > 0
                    ? `Review ${stats.pending_listings} pending`
                    : "Browse listings"}
                </ButtonLink>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Verification</h2>
              <p className="mt-1 text-sm text-slate-600">
                Check that the business behind a listing is real. A listing needs
                this as well as approval before it appears in search.
              </p>
              <div className="mt-3">
                <ButtonLink
                  href="/admin/verifications"
                  variant={stats.pending_verifications > 0 ? "primary" : "secondary"}
                  size="sm"
                >
                  {stats.pending_verifications > 0
                    ? `Review ${stats.pending_verifications} pending`
                    : "Verification queue"}
                </ButtonLink>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Reviews</h2>
              <p className="mt-1 text-sm text-slate-600">
                Search every review and remove ones that break the rules.
                Deleting recalculates the listing&apos;s rating.
              </p>
              <div className="mt-3">
                <ButtonLink href="/admin/reviews" variant="secondary" size="sm">
                  Moderate reviews
                </ButtonLink>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      <p className="mt-8 text-sm text-slate-500">
        <Link href="/" className="underline">
          Back to the site
        </Link>
      </p>
    </div>
  );
}
