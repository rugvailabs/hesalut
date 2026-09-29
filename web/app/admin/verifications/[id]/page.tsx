/**
 * One KYC submission, in full, with the documents.
 *
 * The queue exists to clear obvious cases; this page exists for the ones that
 * need looking at. Everything submitted is here, the documents open in a new
 * tab so the reviewer does not lose their place, and the decision sits at the
 * bottom where it is made after reading rather than before.
 *
 * Readable at any status, not just pending: a reviewer who just approved
 * something is still on this page, and it should show what they did instead of
 * 404ing under them.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import AdminNav from "@/components/AdminNav";
import StatusBadge from "@/components/StatusBadge";
import VerificationBadge from "@/components/VerificationBadge";
import VerificationDecision from "@/components/VerificationDecision";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import { ApiError, getVerificationForReview } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import type { BusinessStatus, PendingVerificationItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export default async function VerificationDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  await requireAdmin(`/admin/verifications/${params.id}`);

  const verificationId = Number(params.id);
  if (!Number.isInteger(verificationId) || verificationId < 1) notFound();

  let item: PendingVerificationItem;
  try {
    item = await getVerificationForReview(verificationId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">

      <Link href="/admin/verifications" className="text-sm underline">
        &larr; Verification queue
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {item.business_name}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {item.business_city} &middot; submitted {formatWhen(item.submitted_at)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <VerificationBadge status={item.status} showHint />
        <StatusBadge status={item.business_status as BusinessStatus} showHint />
      </div>

      <div className="mt-5">
        <AdminNav current="verifications" />
      </div>

      {item.status === "rejected" && item.rejection_reason !== null ? (
        <div className="mb-4">
          <Alert tone="error" title="Rejected">
            <p>{item.rejection_reason}</p>
            <p className="mt-1 text-xs">
              Decided {formatWhen(item.reviewed_at)}. The owner sees this and
              can resubmit.
            </p>
          </Alert>
        </div>
      ) : null}

      {item.status === "verified" ? (
        <div className="mb-4">
          <Alert tone="success" title="Verified">
            Decided {formatWhen(item.reviewed_at)}.{" "}
            {item.business_status === "approved"
              ? "The listing is approved as well, so it is in public search."
              : "The listing itself still needs approving before it appears in search."}
          </Alert>
        </div>
      ) : null}

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold text-slate-900">What was submitted</h2>
        <dl className="space-y-3 text-sm">
          <Field label="Contact email" value={item.email} />
          <Field label="Mobile number" value={item.mobile_number} />
          <Field label="Licence number" value={item.license_number} />
          <Field label="GST/HST number" value={item.gst_number} />
          <Field
            label="Listing owner"
            value={item.owner_email ?? "No owner account"}
          />
          <Field
            label="Public page"
            value={
              item.business_status === "approved" && item.status === "verified"
                ? `/business/${item.business_slug}`
                : "Not visible yet"
            }
          />
        </dl>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold text-slate-900">Documents</h2>
        <p className="mb-3 text-xs text-slate-500">
          Opens in a new tab through a short-lived signed link, so a URL that
          ends up in a screenshot or a log stops working.
        </p>
        <ul className="space-y-2 text-sm">
          <DocumentLink
            id={item.id}
            kind="license"
            label="Trade licence"
            url={item.license_document_url}
          />
          <DocumentLink
            id={item.id}
            kind="gst"
            label="GST/HST document"
            url={item.gst_document_url}
          />
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Neither is required. Not every trade is licensed, and a business under
          the small-supplier threshold has no GST number - judge what is
          appropriate for this trade rather than what is missing.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">Decision</h2>
        <VerificationDecision
          verificationId={item.id}
          businessName={item.business_name}
          status={item.status}
        />
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">
        {value ?? <span className="text-slate-400">Not given</span>}
      </dd>
    </div>
  );
}

function DocumentLink({
  id,
  kind,
  label,
  url,
}: {
  id: number;
  kind: "license" | "gst";
  label: string;
  url: string | null;
}): JSX.Element {
  if (url === null) {
    return (
      <li className="flex flex-wrap items-center gap-2">
        <span className="w-36 shrink-0 text-slate-500">{label}</span>
        <span className="text-slate-400">Not submitted</span>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-36 shrink-0 text-slate-500">{label}</span>
      <a
        href={`/api/admin/verifications/document?id=${id}&kind=${kind}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-slate-900 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Open {label.toLowerCase()}
      </a>
      {/* The stored reference, shown because a reviewer chasing a problem
          needs to know which object they are looking at. */}
      <code className="break-all rounded bg-slate-100 px-1 text-xs text-slate-600">
        {url}
      </code>
    </li>
  );
}
