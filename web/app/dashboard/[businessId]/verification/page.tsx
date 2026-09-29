/**
 * Verification (KYC) for one listing.
 *
 * The panel above the form is the point of this page as much as the form is:
 * an owner whose listing is approved but invisible needs to see *which* of the
 * two gates is holding it, and a rejected owner needs the reviewer's words.
 *
 * Server Component - it reads the listing and its verification with the
 * owner's cookie, and the form below is the only client part.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import DashboardNav from "@/components/ds/DashboardNav";
import SiteFooter from "@/components/ds/SiteFooter";
import VerificationForm from "@/components/VerificationForm";
import { Alert } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { KycBadge, ListingStatusBadge } from "@/components/ds/status";
import { ApiError, getMyBusiness, getVerification } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessDetail, BusinessVerification } from "@/lib/types";

export const dynamic = "force-dynamic";


export default async function VerificationPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const t = tFor(locale);
  await requireBusinessOwner(`/dashboard/${params.businessId}/verification`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  try {
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    // 403 means somebody else's listing. Back to the dashboard, which explains
    // it - rather than a bare error page.
    if (error instanceof ApiError && error.isForbidden) {
      redirect("/dashboard?error=forbidden");
    }
    throw error;
  }

  let verification: BusinessVerification | null = null;
  let loadError: string | null = null;
  try {
    verification = await getVerification(businessId);
  } catch (cause) {
    loadError =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("dashboard.common.apiUnreachable")
          : cause.message
        : t("dashboard.verification.loadErrorFallback");
  }

  const moderationDone = listing.status === "approved";
  const kycDone = verification?.status === "verified";
  const live = moderationDone && kycDone;

  return (
    <>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="link" size="sm" className="-ml-1 h-auto px-1">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            {t("dashboard.common.yourListings")}
          </Link>
        </Button>

        <h1 className="mt-2 text-page-title text-ink">
          {t("dashboard.verification.title", { name: listing.name })}
        </h1>
        <p className="mt-1 max-w-prose text-body text-ink-muted">
          {t("dashboard.verification.intro")}
        </p>

        <DashboardNav
          businessId={businessId}
          current="verification"
          className="mt-4"
          locale={locale}
        />

        {loadError !== null ? (
          <Alert locale={locale}
            tone="error"
            title={t("dashboard.verification.loadErrorTitle")}
            className="mt-4"
          >
            {loadError}
          </Alert>
        ) : null}

        {/* Both gates together, because "why is my listing not showing up" has
            two possible answers and the owner cannot act on the wrong one. */}
        <Card className="mt-4 p-4">
          <h2 className="text-section-heading text-ink">
            {live
              ? t("dashboard.verification.liveHeading")
              : t("dashboard.verification.needsHeading")}
          </h2>

          <dl className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-body text-ink-muted">
                {t("dashboard.verification.listingReview")}
              </dt>
              <dd>
                <ListingStatusBadge locale={locale} status={listing.status} showHint />
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-body text-ink-muted">
                {t("dashboard.verification.businessVerification")}
              </dt>
              <dd>
                <KycBadge locale={locale} status={verification?.status ?? null} showHint />
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-body text-ink-muted">
            {live
              ? t("dashboard.verification.liveBody", { name: listing.name })
              : t("dashboard.verification.pendingBody", {
                  moderation: moderationDone
                    ? t("dashboard.verification.moderation.approved")
                    : t("dashboard.verification.moderation.waiting"),
                  kyc: kycDone
                    ? t("dashboard.verification.kyc.verified")
                    : verification === null
                      ? t("dashboard.verification.kyc.none")
                      : verification.status === "pending"
                        ? t("dashboard.verification.kyc.pending")
                        : t("dashboard.verification.kyc.rejected"),
                })}
          </p>
        </Card>

        {verification?.status === "rejected" &&
        verification.rejection_reason !== null ? (
          <Alert locale={locale} tone="error" title={t("dashboard.verification.rejectedTitle")} className="mt-4">
            <p>{verification.rejection_reason}</p>
            <p className="mt-1 text-meta">
              {verification.reviewed_at !== null
                ? t("dashboard.verification.reviewedOn", {
                    date: formatDate(verification.reviewed_at, intl),
                  })
                : t("dashboard.verification.reviewedRecently")}
            </p>
          </Alert>
        ) : null}

        {verification?.status === "pending" ? (
          <Alert locale={locale} tone="info" title={t("dashboard.verification.withReviewerTitle")} className="mt-4">
            {t("dashboard.verification.withReviewerBody", {
              date: formatDate(verification.submitted_at, intl),
            })}
          </Alert>
        ) : null}

        <Card className="mt-4 p-4">
          <h2 className="mb-4 text-section-heading text-ink">
            {verification === null
              ? t("dashboard.verification.detailsHeading")
              : t("dashboard.verification.updateHeading")}
          </h2>
          <VerificationForm
            businessId={businessId}
            businessName={listing.name}
            existing={verification}
            locale={locale}
          />
        </Card>

        <p className="mt-4 max-w-prose text-meta text-ink-subtle">
          {t("dashboard.verification.privacyNote")}
        </p>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
