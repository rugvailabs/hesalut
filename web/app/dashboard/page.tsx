/**
 * Owner dashboard: the listings this account owns.
 *
 * Server Component. Middleware gates /dashboard on the cached role cookie, but
 * requireBusinessOwner() re-checks against /me, which is the check that
 * actually holds - the cookie is only a hint to avoid a round trip.
 *
 * The restyle changed the composition, not the data. Each listing is a card
 * that answers one question first - is this in search, and if not, what is
 * stopping it - because that is what an owner opens this page to find out. The
 * two gates are separate badges and the blocker is one sentence with a link
 * straight to the step that clears it.
 */

import Link from "next/link";
import { Plus } from "lucide-react";

import SiteFooter from "@/components/ds/SiteFooter";
import { Alert, EmptyState } from "@/components/ds/feedback";
import { RatingPill } from "@/components/ds/indicators";
import { Button, Card } from "@/components/ds/primitives";
import { KycBadge, ListingStatusBadge, visibilityBlocker } from "@/components/ds/status";
import { ApiError, getMyBusinesses, getVerification } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { formatAddress } from "@/lib/format";
import { getNewLeads } from "@/lib/lead-notifications";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessOwnerItem, VerificationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireBusinessOwner("/dashboard");
  // Set when an ownership check bounced the owner off another listing.
  const forbidden = searchParams.error === "forbidden";

  let listings: BusinessOwnerItem[] = [];
  let error: string | null = null;
  try {
    listings = await getMyBusinesses();
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("dashboard.common.apiUnreachable")
          : cause.message
        : t("dashboard.index.loadErrorFallback");
  }

  // What has arrived since the owner last looked; unknown is shown as nothing.
  const leadNotes = await getNewLeads();
  const newLeadsFor = (id: number): number =>
    leadNotes?.businesses.find((b) => b.business_id === id)?.new_leads ?? 0;
  const totalNew = leadNotes?.total_new ?? 0;

  // One request per listing: there is no bulk endpoint, and an owner has a
  // handful rather than hundreds. They go out together, and a failure leaves
  // that one badge unknown rather than taking down the page.
  const verifications = new Map<number, VerificationStatus | null>();
  const results = await Promise.allSettled(
    listings.map(async (listing) => ({
      id: listing.id,
      status: (await getVerification(listing.id))?.status ?? null,
    })),
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      verifications.set(result.value.id, result.value.status);
    }
  }

  return (
    <>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-page-title text-ink">{t("dashboard.index.title")}</h1>
            <p className="mt-1 text-body text-ink-muted">
              {t("dashboard.index.subtitle")}
            </p>
          </div>
          {listings.length > 0 ? (
            <Button asChild>
              <Link href="/dashboard/new-listing">
                <Plus aria-hidden="true" />
                {t("dashboard.index.addListing")}
              </Link>
            </Button>
          ) : null}
        </div>

        {totalNew > 0 ? (
          <Alert locale={locale} tone="info" className="mt-4">
            {totalNew === 1
              ? t("dashboard.index.newLeadsOne")
              : t("dashboard.index.newLeadsMany", { count: totalNew })}
          </Alert>
        ) : null}

        {forbidden ? (
          <Alert locale={locale} tone="warning" className="mt-4">
            {t("dashboard.index.forbidden")}
          </Alert>
        ) : null}

        {error !== null ? (
          <Alert locale={locale} tone="error" title={t("dashboard.index.loadErrorTitle")} className="mt-4">
            {error}
          </Alert>
        ) : listings.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Plus className="size-5" aria-hidden="true" />}
            title={t("dashboard.index.emptyTitle")}
            body={t("dashboard.index.emptyBody")}
            action={{ label: t("dashboard.index.emptyAction"), href: "/dashboard/new-listing" }}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {listings.map((listing) => {
              const kyc = verifications.get(listing.id) ?? null;
              const blocker = visibilityBlocker(listing.status, kyc, locale);
              const live = blocker === null;

              return (
                <li key={listing.id}>
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-card-title text-ink">
                          {listing.name}
                        </h2>
                        <p className="text-meta text-ink-subtle">
                          {formatAddress(listing)}
                        </p>
                        <div className="mt-1.5">
                          <RatingPill
                            rating={listing.rating}
                            reviewCount={listing.review_count}
                            size="sm"
                            locale={locale}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <ListingStatusBadge locale={locale} status={listing.status} />
                        <KycBadge locale={locale} status={kyc} />
                      </div>
                    </div>

                    {/* Approved-but-unverified is the confusing case: the badge
                        says Live and the listing is not in search. Name the
                        missing step and link straight to it. */}
                    {blocker !== null ? (
                      <Alert locale={locale} tone="warning">
                        {blocker}{" "}
                        <Link
                          href={`/dashboard/${listing.id}/verification`}
                          className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {kyc === null
                            ? t("dashboard.index.verifyThis")
                            : t("dashboard.index.openVerification")}
                        </Link>
                      </Alert>
                    ) : null}

                    {/* A rejection the owner cannot read is a dead end, so the
                        moderator's reason is surfaced rather than filed. */}
                    {listing.moderation_note !== null &&
                    (listing.status === "rejected" || listing.status === "suspended") ? (
                      <Alert locale={locale} tone="warning" title={t("dashboard.index.moderatorNote")}>
                        {listing.moderation_note}
                      </Alert>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          "edit",
                          "leads",
                          "reviews",
                          "verification",
                          "billing",
                        ] as const
                      ).map((segment) => (
                        <Button key={segment} asChild variant="secondary" size="sm">
                          <Link href={`/dashboard/${listing.id}/${segment}`}>
                            {t(`dashboard.nav.${segment}`)}
                            {segment === "leads" && newLeadsFor(listing.id) > 0 ? (
                              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-warning-bg px-1.5 text-micro tabular text-warning">
                                {newLeadsFor(listing.id)}
                              </span>
                            ) : null}
                          </Link>
                        </Button>
                      ))}

                      {live ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/business/${listing.slug}`}>{t("dashboard.index.viewPublic")}</Link>
                        </Button>
                      ) : (
                        <span className="text-meta text-ink-subtle">
                          {t("dashboard.index.noPublicPage")}
                        </span>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
