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
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { AdminStats } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  urgent = false,
  intl,
}: {
  label: string;
  value: number;
  hint?: string;
  urgent?: boolean;
  intl: string;
}): JSX.Element {
  return (
    <Card className={urgent && value > 0 ? "border-warning/40 bg-warning-bg" : undefined}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          urgent && value > 0 ? "text-warning" : "text-ink"
        }`}
      >
        {value.toLocaleString(intl)}
      </p>
      {hint !== undefined ? (
        <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </Card>
  );
}

export default async function AdminHomePage(): Promise<JSX.Element> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const t = tFor(locale);
  await requireAdmin("/admin");

  let stats: AdminStats | null = null;
  let error: string | null = null;
  try {
    stats = await getAdminStats();
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("admin.common.apiUnreachable")
          : cause.message
        : t("admin.overview.loadError");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {t("admin.overview.title")}
      </h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        {t("admin.overview.intro")}
      </p>

      <div className="mt-5">
        <AdminNav
          current="overview"
          pendingListings={stats?.pending_listings}
          pendingVerifications={stats?.pending_verifications}
          locale={locale}
        />
      </div>

      {error !== null ? (
        <Alert locale={locale} tone="error" title={t("admin.overview.loadErrorTitle")}>
          {error}
        </Alert>
      ) : stats !== null ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={t("admin.overview.pendingReview")}
              value={stats.pending_listings}
              hint={
                stats.pending_listings > 0
                  ? t("admin.overview.waitingOnYou")
                  : t("admin.overview.nothingWaiting")
              }
              urgent
              intl={intl}
            />
            <Stat
              label={t("admin.overview.awaitingVerification")}
              value={stats.pending_verifications}
              hint={
                stats.pending_verifications > 0
                  ? t("admin.overview.kycWaiting")
                  : t("admin.overview.nothingWaiting")
              }
              urgent
              intl={intl}
            />
            <Stat
              label={t("admin.overview.liveListings")}
              value={stats.approved_listings}
              hint={t("admin.overview.inPublicSearch")}
              intl={intl}
            />
            <Stat label={t("admin.overview.totalListings")} value={stats.total_businesses} intl={intl} />
            <Stat label={t("admin.overview.users")} value={stats.total_users} intl={intl} />
            <Stat label={t("admin.overview.reviews")} value={stats.total_reviews} intl={intl} />
            <Stat label={t("admin.overview.enquiries")} value={stats.total_enquiries} intl={intl} />
            <Stat label={t("admin.overview.conversations")} value={stats.total_conversations} intl={intl} />
            <Stat
              label={t("admin.overview.notVisible")}
              value={stats.rejected_listings + stats.suspended_listings}
              hint={t("admin.overview.notVisibleHint", {
                rejected: stats.rejected_listings.toLocaleString(intl),
                suspended: stats.suspended_listings.toLocaleString(intl),
              })}
              intl={intl}
            />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <h2 className="font-semibold text-ink">
                {t("admin.overview.listingsTitle")}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {t("admin.overview.listingsBody")}
              </p>
              <div className="mt-3">
                <ButtonLink href="/admin/listings" size="sm">
                  {stats.pending_listings > 0
                    ? t("admin.overview.reviewPending", {
                        count: stats.pending_listings.toLocaleString(intl),
                      })
                    : t("admin.overview.browseListings")}
                </ButtonLink>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-ink">
                {t("admin.overview.verificationTitle")}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {t("admin.overview.verificationBody")}
              </p>
              <div className="mt-3">
                <ButtonLink
                  href="/admin/verifications"
                  variant={stats.pending_verifications > 0 ? "primary" : "secondary"}
                  size="sm"
                >
                  {stats.pending_verifications > 0
                    ? t("admin.overview.reviewPending", {
                        count: stats.pending_verifications.toLocaleString(intl),
                      })
                    : t("admin.overview.verificationQueue")}
                </ButtonLink>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-ink">
                {t("admin.overview.reviewsTitle")}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {t("admin.overview.reviewsBody")}
              </p>
              <div className="mt-3">
                <ButtonLink href="/admin/reviews" variant="secondary" size="sm">
                  {t("admin.overview.moderateReviews")}
                </ButtonLink>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      <p className="mt-8 text-sm text-ink-subtle">
        <Link href="/" className="underline">
          {t("admin.overview.backToSite")}
        </Link>
      </p>
    </div>
  );
}
