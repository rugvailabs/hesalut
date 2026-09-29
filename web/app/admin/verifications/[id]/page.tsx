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
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessStatus, PendingVerificationItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string | null, locale: Locale): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(INTL_LOCALE[locale], {
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
  const locale = getLocale();
  const t = tFor(locale);
  await requireAdmin(`/admin/verifications/${params.id}`);

  const notGiven = t("admin.common.notGiven");

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
        &larr; {t("admin.verification.back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {item.business_name}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.verification.submitted", {
          city: item.business_city,
          date: formatWhen(item.submitted_at, locale),
        })}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <VerificationBadge status={item.status} showHint locale={locale} />
        <StatusBadge
          status={item.business_status as BusinessStatus}
          showHint
          locale={locale}
        />
      </div>

      <div className="mt-5">
        <AdminNav current="verifications" locale={locale} />
      </div>

      {item.status === "rejected" && item.rejection_reason !== null ? (
        <div className="mb-4">
          <Alert locale={locale} tone="error" title={t("admin.verification.rejectedTitle")}>
            <p>{item.rejection_reason}</p>
            <p className="mt-1 text-xs">
              {t("admin.verification.rejectedDecided", {
                date: formatWhen(item.reviewed_at, locale),
              })}
            </p>
          </Alert>
        </div>
      ) : null}

      {item.status === "verified" ? (
        <div className="mb-4">
          <Alert locale={locale} tone="success" title={t("admin.verification.verifiedTitle")}>
            {t("admin.verification.decided", {
              date: formatWhen(item.reviewed_at, locale),
            })}{" "}
            {item.business_status === "approved"
              ? t("admin.verification.inSearch")
              : t("admin.verification.needsApproval")}
          </Alert>
        </div>
      ) : null}

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold text-slate-900">
          {t("admin.verification.submittedHeading")}
        </h2>
        <dl className="space-y-3 text-sm">
          <Field
            label={t("admin.verification.fields.contactEmail")}
            value={item.email}
            notGiven={notGiven}
          />
          <Field
            label={t("admin.verification.fields.mobile")}
            value={item.mobile_number}
            notGiven={notGiven}
          />
          <Field
            label={t("admin.verification.fields.licence")}
            value={item.license_number}
            notGiven={notGiven}
          />
          <Field
            label={t("admin.verification.fields.gst")}
            value={item.gst_number}
            notGiven={notGiven}
          />
          <Field
            label={t("admin.verification.fields.owner")}
            value={item.owner_email ?? t("admin.verification.noOwnerAccount")}
            notGiven={notGiven}
          />
          <Field
            label={t("admin.verification.fields.publicPage")}
            value={
              item.business_status === "approved" && item.status === "verified"
                ? `/business/${item.business_slug}`
                : t("admin.verification.notVisibleYet")
            }
            notGiven={notGiven}
          />
        </dl>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold text-slate-900">
          {t("admin.verification.documents")}
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          {t("admin.verification.documentsIntro")}
        </p>
        <ul className="space-y-2 text-sm">
          <DocumentLink
            id={item.id}
            kind="license"
            label={t("admin.verification.tradeLicence")}
            openLabel={t("admin.verification.openTradeLicence")}
            notSubmitted={t("admin.verification.notSubmitted")}
            url={item.license_document_url}
          />
          <DocumentLink
            id={item.id}
            kind="gst"
            label={t("admin.verification.gstDocument")}
            openLabel={t("admin.verification.openGstDocument")}
            notSubmitted={t("admin.verification.notSubmitted")}
            url={item.gst_document_url}
          />
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          {t("admin.verification.documentsNote")}
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">
          {t("admin.verification.decision")}
        </h2>
        <VerificationDecision
          verificationId={item.id}
          businessName={item.business_name}
          status={item.status}
          locale={locale}
        />
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  notGiven,
}: {
  label: string;
  value: string | null;
  notGiven: string;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">
        {value ?? <span className="text-slate-400">{notGiven}</span>}
      </dd>
    </div>
  );
}

function DocumentLink({
  id,
  kind,
  label,
  openLabel,
  notSubmitted,
  url,
}: {
  id: number;
  kind: "license" | "gst";
  label: string;
  openLabel: string;
  notSubmitted: string;
  url: string | null;
}): JSX.Element {
  if (url === null) {
    return (
      <li className="flex flex-wrap items-center gap-2">
        <span className="w-36 shrink-0 text-slate-500">{label}</span>
        <span className="text-slate-400">{notSubmitted}</span>
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
        {openLabel}
      </a>
      {/* The stored reference, shown because a reviewer chasing a problem
          needs to know which object they are looking at. */}
      <code className="break-all rounded bg-slate-100 px-1 text-xs text-slate-600">
        {url}
      </code>
    </li>
  );
}
