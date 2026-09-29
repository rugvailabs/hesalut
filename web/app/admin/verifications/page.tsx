/**
 * The KYC review queue.
 *
 * Oldest first, which the API decides - the owner who has been waiting longest
 * is the one to see first, and it is the opposite of every other list here.
 *
 * Each row carries enough to make the easy calls without opening anything: the
 * business, what was submitted, and whether its listing is already approved -
 * which is what tells a reviewer whether approving this is the last thing
 * standing between the listing and public search.
 */

import Link from "next/link";

import AdminNav from "@/components/AdminNav";
import StatusBadge from "@/components/StatusBadge";
import VerificationDecision from "@/components/VerificationDecision";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import { ApiError, getPendingVerifications } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import type { BusinessStatus, PendingVerificationItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** How long it has been waiting, which is the thing that makes a queue urgent. */
function waitedFor(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "just now";
}

export default async function AdminVerificationsPage(): Promise<JSX.Element> {
  await requireAdmin("/admin/verifications");

  let queue: PendingVerificationItem[] = [];
  let error: string | null = null;
  try {
    queue = await getPendingVerifications({ limit: 100 });
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the verification queue.";
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Business verification
      </h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">
        Check that the business behind a listing is real. This is separate from
        approving the listing&apos;s content - a listing needs both before it
        appears in public search.
      </p>

      <AdminNav current="verifications" pendingVerifications={queue.length} />

      {error !== null ? (
        <Alert tone="error" title="Could not load the queue">
          {error}
        </Alert>
      ) : queue.length === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">
            No pending verifications
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Nothing is waiting on a reviewer. Submissions land here as owners
            send them from their dashboard.
          </p>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {queue.length} {queue.length === 1 ? "submission" : "submissions"}{" "}
            waiting, oldest first.
          </p>

          <ul className="space-y-3">
            {queue.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/verifications/${item.id}`}
                        className="font-semibold text-slate-900 underline"
                      >
                        {item.business_name}
                      </Link>
                      <p className="text-sm text-slate-500">
                        {item.business_city} &middot; submitted{" "}
                        {formatWhen(item.submitted_at)} ({waitedFor(item.submitted_at)})
                      </p>
                    </div>
                    {/* The listing's own moderation state, so a reviewer knows
                        whether this decision is the last one standing. */}
                    <StatusBadge status={item.business_status as BusinessStatus} />
                  </div>

                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row label="Contact email" value={item.email} />
                    <Row label="Mobile" value={item.mobile_number} />
                    <Row
                      label="Licence"
                      value={item.license_number}
                      hasDocument={item.license_document_url !== null}
                    />
                    <Row
                      label="GST/HST"
                      value={item.gst_number}
                      hasDocument={item.gst_document_url !== null}
                    />
                    <Row label="Owner" value={item.owner_email} />
                  </dl>

                  <div className="flex flex-wrap items-center gap-3">
                    <VerificationDecision
                      verificationId={item.id}
                      businessName={item.business_name}
                      status={item.status}
                    />
                    <Link
                      href={`/admin/verifications/${item.id}`}
                      className="text-sm underline"
                    >
                      Open documents and full detail
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  hasDocument,
}: {
  label: string;
  value: string | null;
  hasDocument?: boolean;
}): JSX.Element {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">
        {value ?? <span className="text-slate-400">Not given</span>}
        {hasDocument ? (
          <span className="ml-2 text-xs text-emerald-700">document attached</span>
        ) : null}
      </dd>
    </div>
  );
}
