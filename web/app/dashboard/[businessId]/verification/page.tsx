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
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import type { BusinessDetail, BusinessVerification } from "@/lib/types";

export const dynamic = "force-dynamic";

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];

export default async function VerificationPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
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
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the verification status.";
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
            Your listings
          </Link>
        </Button>

        <h1 className="mt-2 text-page-title text-ink">Verify {listing.name}</h1>
        <p className="mt-1 max-w-prose text-body text-ink-muted">
          We check that the business behind a listing is real before it appears
          in search. This is separate from the review of the listing&apos;s
          content.
        </p>

        <DashboardNav businessId={businessId} current="verification" className="mt-4" />

        {loadError !== null ? (
          <Alert
            tone="error"
            title="Could not load the verification status"
            className="mt-4"
          >
            {loadError}
          </Alert>
        ) : null}

        {/* Both gates together, because "why is my listing not showing up" has
            two possible answers and the owner cannot act on the wrong one. */}
        <Card className="mt-4 p-4">
          <h2 className="text-section-heading text-ink">
            {live ? "This listing is live" : "What this listing still needs"}
          </h2>

          <dl className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-body text-ink-muted">Listing review</dt>
              <dd>
                <ListingStatusBadge status={listing.status} showHint />
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-body text-ink-muted">Business verification</dt>
              <dd>
                <KycBadge status={verification?.status ?? null} showHint />
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-body text-ink-muted">
            {live ? (
              <>Both checks have passed, so {listing.name} appears in public search.</>
            ) : (
              <>
                A listing appears in search only once both are done. Right now it
                is {moderationDone ? "approved" : "waiting on a moderator"} and{" "}
                {kycDone
                  ? "verified"
                  : verification === null
                    ? "not verified yet"
                    : verification.status === "pending"
                      ? "waiting on verification"
                      : "rejected on verification"}
                .
              </>
            )}
          </p>
        </Card>

        {verification?.status === "rejected" &&
        verification.rejection_reason !== null ? (
          <Alert tone="error" title="A reviewer could not verify this" className="mt-4">
            <p>{verification.rejection_reason}</p>
            <p className="mt-1 text-meta">
              Reviewed{" "}
              {verification.reviewed_at !== null
                ? `on ${formatDate(verification.reviewed_at, intl)}`
                : "recently"}
              . Fix what is described above and send it again.
            </p>
          </Alert>
        ) : null}

        {verification?.status === "pending" ? (
          <Alert tone="info" title="With a reviewer" className="mt-4">
            Submitted {formatDate(verification.submitted_at, intl)}. You can send
            corrected details below at any time; the latest submission is the one
            that gets reviewed.
          </Alert>
        ) : null}

        <Card className="mt-4 p-4">
          <h2 className="mb-4 text-section-heading text-ink">
            {verification === null ? "Your details" : "Update your details"}
          </h2>
          <VerificationForm
            businessId={businessId}
            businessName={listing.name}
            existing={verification}
          />
        </Card>

        <p className="mt-4 max-w-prose text-meta text-ink-subtle">
          Documents are stored separately from your public listing and are only
          read by a reviewer. Your licence and GST numbers never appear on your
          public page.
        </p>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
