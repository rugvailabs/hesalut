/**
 * Reviews management for one listing.
 *
 * Server Component. Ownership follows the same pattern as the edit and leads
 * pages: the backend 403s a listing owned by someone else, and that becomes a
 * redirect to /dashboard rather than a crash.
 *
 * Owners can reply but not delete - removing a review is an admin action in
 * the backend, and a business deleting its own bad reviews would make the
 * whole rating meaningless.
 *
 * The summary here is the real one, from the reviews endpoint, not the
 * denormalised rating on the business row. On this page that distinction
 * matters: an owner looking at their own reviews is counting the ones they
 * have to answer, and the row's number does not correspond to them.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";

import DashboardNav from "@/components/ds/DashboardNav";
import OwnerReviewList from "@/components/OwnerReviewList";
import RatingBreakdown from "@/components/ds/RatingBreakdown";
import SiteFooter from "@/components/ds/SiteFooter";
import { EmptyState } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { ApiError, getMyBusiness, getReviewSummary, getReviews } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type {
  BusinessDetail,
  BusinessReview,
  BusinessReviewSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";


export default async function DashboardReviewsPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireBusinessOwner(`/dashboard/${params.businessId}/reviews`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  let reviews: BusinessReview[] = [];
  let summary: BusinessReviewSummary | null = null;

  try {
    // Ownership first: no point fetching reviews for a listing the caller
    // cannot see.
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      redirect("/dashboard?error=forbidden");
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // A listing awaiting approval is not publicly readable, so the public review
  // endpoints 404 for it. That is not an error worth showing - it just means
  // there is nothing to manage yet.
  try {
    [reviews, summary] = await Promise.all([
      getReviews(businessId, { limit: 100 }),
      getReviewSummary(businessId),
    ]);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  const unanswered = reviews.filter((r) => r.owner_reply === null).length;

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
          {t("dashboard.reviews.title", { name: listing.name })}
        </h1>
        <p className="mt-1 text-body text-ink-muted">
          {reviews.length === 0
            ? t("dashboard.reviews.nothingYet")
            : unanswered > 0
              ? t("dashboard.reviews.awaiting", { unanswered, total: reviews.length })
              : t("dashboard.reviews.allAnswered")}
        </p>

        <DashboardNav
          businessId={businessId}
          current="reviews"
          className="mt-4"
          unansweredReviews={unanswered}
          locale={locale}
        />

        {summary !== null && summary.review_count > 0 ? (
          <Card className="mt-4 p-4">
            <h2 className="sr-only">{t("dashboard.reviews.breakdown")}</h2>
            <RatingBreakdown summary={summary} locale={locale} />
          </Card>
        ) : null}

        {reviews.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<MessageSquare className="size-5" aria-hidden="true" />}
            title={t("dashboard.reviews.emptyTitle")}
            body={
              listing.status === "approved"
                ? t("dashboard.reviews.emptyBodyLive")
                : t("dashboard.reviews.emptyBodyHidden")
            }
            action={{ label: t("dashboard.common.backToListings"), href: "/dashboard" }}
          />
        ) : (
          <div className="mt-4">
            <OwnerReviewList businessId={businessId} reviews={reviews} locale={locale} />
          </div>
        )}
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
