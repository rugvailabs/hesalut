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
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessStatus, PendingVerificationItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string, locale: Locale): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(INTL_LOCALE[locale], {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** How long it has been waiting, which is the thing that makes a queue urgent. */
function waitedFor(iso: string, locale: Locale): string {
  const t = tFor(locale);
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days >= 1) {
    return days === 1
      ? t("admin.verifications.dayAgo")
      : t("admin.verifications.daysAgo", { count: days });
  }
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours >= 1) {
    return hours === 1
      ? t("admin.verifications.hourAgo")
      : t("admin.verifications.hoursAgo", { count: hours });
  }
  return t("admin.verifications.justNow");
}

export default async function AdminVerificationsPage(): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireAdmin("/admin/verifications");

  let queue: PendingVerificationItem[] = [];
  let error: string | null = null;
  try {
    queue = await getPendingVerifications({ limit: 100 });
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("admin.common.apiUnreachable")
          : cause.message
        : t("admin.verifications.loadError");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {t("admin.verifications.title")}
      </h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">
        {t("admin.verifications.intro")}
      </p>

      <AdminNav
        current="verifications"
        pendingVerifications={queue.length}
        locale={locale}
      />

      {error !== null ? (
        <Alert locale={locale} tone="error" title={t("admin.verifications.loadErrorTitle")}>
          {error}
        </Alert>
      ) : queue.length === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">
            {t("admin.verifications.emptyTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("admin.verifications.emptyBody")}
          </p>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {t(
              queue.length === 1
                ? "admin.verifications.countOne"
                : "admin.verifications.countMany",
              { count: queue.length.toLocaleString(INTL_LOCALE[locale]) },
            )}
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
                        {t("admin.verifications.submitted", {
                          city: item.business_city,
                          date: formatWhen(item.submitted_at, locale),
                          ago: waitedFor(item.submitted_at, locale),
                        })}
                      </p>
                    </div>
                    {/* The listing's own moderation state, so a reviewer knows
                        whether this decision is the last one standing. */}
                    <StatusBadge
                      status={item.business_status as BusinessStatus}
                      locale={locale}
                    />
                  </div>

                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row
                      label={t("admin.verifications.fields.contactEmail")}
                      value={item.email}
                      locale={locale}
                    />
                    <Row
                      label={t("admin.verifications.fields.mobile")}
                      value={item.mobile_number}
                      locale={locale}
                    />
                    <Row
                      label={t("admin.verifications.fields.licence")}
                      value={item.license_number}
                      hasDocument={item.license_document_url !== null}
                      locale={locale}
                    />
                    <Row
                      label={t("admin.verifications.fields.gst")}
                      value={item.gst_number}
                      hasDocument={item.gst_document_url !== null}
                      locale={locale}
                    />
                    <Row
                      label={t("admin.verifications.fields.owner")}
                      value={item.owner_email}
                      locale={locale}
                    />
                  </dl>

                  <div className="flex flex-wrap items-center gap-3">
                    <VerificationDecision
                      verificationId={item.id}
                      businessName={item.business_name}
                      status={item.status}
                      locale={locale}
                    />
                    <Link
                      href={`/admin/verifications/${item.id}`}
                      className="text-sm underline"
                    >
                      {t("admin.verifications.openDetail")}
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
  locale,
}: {
  label: string;
  value: string | null;
  hasDocument?: boolean;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">
        {value ?? <span className="text-slate-400">{t("admin.common.notGiven")}</span>}
        {hasDocument ? (
          <span className="ml-2 text-xs text-emerald-700">
            {t("admin.verifications.documentAttached")}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
