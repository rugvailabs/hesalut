/**
 * /business/[slug] - one listing's public profile.
 *
 * Prompt 3 of the restyle applied to the real page. A Server Component, as
 * before: the listing is fetched during render, so the first paint needs no
 * spinner and the markup is crawlable, which is the whole point of having a
 * page per business. generateMetadata gives each one a real title and
 * description for the same reason.
 *
 * The composition is what changed. Identity, the action bar and the enquiry
 * panel are the conversion path and now sit above the fold together; the
 * supporting detail - about, hours, location, reviews - runs down the main
 * column with a sticky contact card beside it.
 *
 * Three calls, each settled independently, so a slow or failing one costs its
 * own section rather than the page: the listing itself (fatal - without it
 * there is no page), the reviews list, and the rating summary.
 *
 * WHAT IS ABSENT, AND WHY. The design asks for more than the backend holds,
 * and each gap is left visible rather than filled with something invented:
 *
 *   - No photo gallery. There is no business_photos table, so the page says
 *     so once, at the foot, instead of showing a stock storefront.
 *   - No hours table unless the listing has hours. The schema, the owner form
 *     and getOpenState() are all real and wired; the seed simply carries none,
 *     so today every listing falls through to "Hours not listed".
 *   - No rating histogram unless the summary endpoint returns real reviews.
 *     See the note above the reviews section: the rating on the business row
 *     and the reviews in the table disagree on seeded data, and an all-zero
 *     histogram under a 4.9 headline would read as "everyone rated this zero".
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, MapPin } from "lucide-react";

import BusinessHours from "@/components/ds/BusinessHours";
import EnquiryPanel from "@/components/ds/EnquiryPanel";
import RatingBreakdown from "@/components/ds/RatingBreakdown";
import ReviewForm from "@/components/ds/ReviewForm";
import ShowNumber from "@/components/ds/ShowNumber";
import SiteFooter from "@/components/ds/SiteFooter";
import { Breadcrumbs, EmptyState } from "@/components/ds/feedback";
import { OpenStatus, RatingPill, VerifiedBadge } from "@/components/ds/indicators";
import { Badge, Button, Card } from "@/components/ds/primitives";
import MapEmbed from "@/components/MapEmbed";
import { getBusinessBySlug, getReviewSummary, getReviews } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  formatDate,
  formatLocality,
  formatPhone,
  formatPostalCode,
} from "@/lib/format";
import { DEFAULT_LOCALE, INTL_LOCALE, tFor } from "@/lib/i18n";
import { googleDirectionsUrl, googleMapsUrl } from "@/lib/maps";
import type { BusinessReview, BusinessReviewSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];
const t = tFor(locale);

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const business = await getBusinessBySlug(params.slug);
  if (business === null) return { title: "Listing not found" };

  const where = formatLocality(business.city, business.province);

  return {
    title: `${business.name} - ${where}`,
    description:
      business.description ??
      `${business.name}, ${business.category_name ?? "local business"} in ${business.city}.`,
  };
}

export default async function BusinessPage({
  params,
}: {
  params: { slug: string };
}): Promise<JSX.Element> {
  const business = await getBusinessBySlug(params.slug);
  if (business === null) notFound();

  // Settled together but independently: neither the list nor the summary is
  // load-bearing for the page, so each failure degrades to its own empty.
  const [reviews, summary] = await Promise.all([
    getReviews(business.id, { limit: 20 }).catch((): BusinessReview[] => []),
    getReviewSummary(business.id).catch((): BusinessReviewSummary | null => null),
  ]);

  const hasPoint = business.latitude !== null && business.longitude !== null;
  const hours =
    business.opening_hours !== null && Object.keys(business.opening_hours).length > 0
      ? business.opening_hours
      : null;
  const where = formatLocality(business.city, business.province);
  const postal = formatPostalCode(business.postal_code);
  const categoryHref =
    business.category_slug !== null
      ? `/search?category=${encodeURIComponent(business.category_slug)}`
      : null;

  // The histogram is only honest when it has something in it.
  const showBreakdown = summary !== null && summary.review_count > 0;

  // Who is looking decides which of four things the reviews section offers.
  // Resolved here rather than in the form so a signed-out visitor is invited
  // to sign in instead of being handed a form that cannot submit.
  const viewer = await getCurrentUser();
  const ownsThis = viewer !== null && business.owner_id === viewer.id;
  // Only as reliable as the page of reviews we fetched: a viewer whose review
  // has fallen past the newest 20 reads as not-yet-reviewed and is offered the
  // form. The backend's unique constraint is the real guard - it answers 409,
  // and the form shows that verbatim.
  const alreadyReviewed =
    viewer !== null && reviews.some((review) => review.author_id === viewer.id);
  const canReview = viewer !== null && !ownsThis && !alreadyReviewed;

  return (
    <>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: t("business.home"), href: "/" },
            ...(business.category_name !== null && categoryHref !== null
              ? [{ label: business.category_name, href: categoryHref }]
              : []),
            { label: business.name },
          ]}
        />

        {/* --- identity ------------------------------------------------- */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-page-title text-ink">{business.name}</h1>
              {/* The real stored decision, not search's implied gate: this
                  page is reachable for listings the gate would exclude. */}
              <VerifiedBadge
                status={business.verified ? "verified" : null}
                locale={locale}
              />
            </div>

            <p className="mt-1 text-body text-ink-muted">
              {categoryHref !== null ? (
                <Link
                  href={categoryHref}
                  className="rounded-sm hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {business.category_name}
                </Link>
              ) : (
                business.category_name
              )}
              {where ? <> &middot; {where}</> : null}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <RatingPill
                rating={business.rating}
                reviewCount={business.review_count}
                locale={locale}
              />
              {/* showUnknown: on this page the absence of hours is itself
                  worth stating - the visitor came here to find out. */}
              <OpenStatus hours={hours} locale={locale} showUnknown />
              {business.price_range !== null ? (
                <span className="text-meta text-ink-subtle tabular">
                  {business.price_range}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* --- action bar ----------------------------------------------- */}
        {/* The page's conversion point. Not sticky: the header above it
            already is, and two stacked sticky bars eat a phone's viewport. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-line py-3">
          {business.phone !== null ? (
            <ShowNumber
              businessId={business.id}
              phone={business.phone}
              locale={locale}
              size="md"
              variant="primary"
            />
          ) : (
            <span className="text-meta text-ink-subtle">{t("business.noPhone")}</span>
          )}

          {business.website !== null ? (
            <Button asChild variant="secondary">
              <a href={business.website} target="_blank" rel="noopener noreferrer">
                <Globe aria-hidden="true" />
                {t("business.website")}
              </a>
            </Button>
          ) : null}

          {hasPoint ? (
            <Button asChild variant="ghost">
              <a
                href={googleDirectionsUrl(business.latitude as number, business.longitude as number)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin aria-hidden="true" />
                {t("listing.directions")}
              </a>
            </Button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* --- main column -------------------------------------------- */}
          <div className="space-y-8 lg:col-span-2">
            <EnquiryPanel
              businessId={business.id}
              businessName={business.name}
              locale={locale}
            />

            {business.description !== null ? (
              <section>
                <h2 className="text-section-heading text-ink">
                  {t("business.about")}
                </h2>
                <p className="mt-2 max-w-prose text-body text-ink-muted">
                  {business.description}
                </p>

                {business.tags !== null && business.tags.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {business.tags.map((tag) => (
                      <li key={tag}>
                        <Badge tone="neutral">{tag}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {hours !== null ? (
              <section>
                <h2 className="text-section-heading text-ink">
                  {t("business.hours")}
                </h2>
                <BusinessHours hours={hours} locale={locale} className="mt-2" />
              </section>
            ) : null}

            <section>
              <h2 className="text-section-heading text-ink">
                {t("business.location")}
              </h2>
              <Card className="mt-2 p-4">
                <address className="not-italic text-body text-ink-muted">
                  {business.address !== null ? <div>{business.address}</div> : null}
                  <div>
                    {where}
                    {postal !== null ? ` ${postal}` : ""}
                  </div>
                </address>

                {hasPoint ? (
                  <div className="mt-3">
                    <MapEmbed
                      latitude={business.latitude as number}
                      longitude={business.longitude as number}
                      name={business.name}
                    />
                    <a
                      href={googleMapsUrl(business.latitude as number, business.longitude as number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block rounded-sm text-meta text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("business.openInMaps")}
                    </a>
                  </div>
                ) : (
                  <p className="mt-3 text-meta text-ink-subtle">
                    {t("business.notMapped")}
                  </p>
                )}
              </Card>
            </section>

            {/* --- reviews ---------------------------------------------- */}
            <section>
              <h2 className="text-section-heading text-ink">
                {t("business.reviewsHeading")}
                {reviews.length > 0 ? ` (${reviews.length})` : ""}
              </h2>

              {showBreakdown ? (
                <Card className="mt-2 p-4">
                  <h3 className="sr-only">{t("business.ratingBreakdown")}</h3>
                  <RatingBreakdown summary={summary} locale={locale} />
                </Card>
              ) : null}

              {/* An owner reviewing their own listing is self-dealing, and the
                  backend refuses it - so the form is simply not offered
                  rather than shown and then rejected. */}
              <div id="review" className="mt-3 scroll-mt-24">
                {canReview ? (
                  <ReviewForm
                    businessId={business.id}
                    businessName={business.name}
                  />
                ) : viewer === null ? (
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-body text-ink-muted">
                      Been here? Sign in to leave a review.
                    </p>
                    <Button asChild variant="secondary" size="sm">
                      <Link
                        href={`/login?next=${encodeURIComponent(`/business/${business.slug}#review`)}`}
                      >
                        Sign in
                      </Link>
                    </Button>
                  </Card>
                ) : alreadyReviewed ? (
                  <p className="text-meta text-ink-subtle">
                    You have already reviewed this business. Your review is
                    below.
                  </p>
                ) : null}
              </div>

              {reviews.length === 0 ? (
                <EmptyState
                  className="mt-2"
                  title={t("business.noReviewsTitle")}
                  body={t("business.noReviewsBody", { name: business.name })}
                />
              ) : (
                <ul className="mt-2 space-y-3">
                  {reviews.map((review) => (
                    <li key={review.id}>
                      <Card className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <RatingPill rating={review.rating} size="sm" locale={locale} />
                          <div className="text-right text-meta text-ink-subtle">
                            <div>{review.author_name}</div>
                            <div>{formatDate(review.created_at, intl)}</div>
                          </div>
                        </div>

                        {review.title !== null ? (
                          <h3 className="mt-2 text-card-title text-ink">
                            {review.title}
                          </h3>
                        ) : null}

                        {review.body !== null ? (
                          <p className="mt-1 text-body text-ink-muted">{review.body}</p>
                        ) : null}

                        {/* The owner's reply, under the review it answers -
                            the same owner_reply the dashboard writes. */}
                        {review.owner_reply !== null ? (
                          <div className="mt-3 rounded-input border-l-2 border-brand-300 bg-surface-muted px-3 py-2">
                            <p className="text-micro uppercase text-ink-subtle">
                              {t("business.ownerReply", { name: business.name })}
                            </p>
                            <p className="mt-1 text-body text-ink-muted">
                              {review.owner_reply}
                            </p>
                          </div>
                        ) : null}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* --- aside --------------------------------------------------- */}
          <aside className="lg:col-span-1">
            <Card className="p-4 lg:sticky lg:top-24">
              <h2 className="text-micro uppercase text-ink-subtle">
                {t("business.contact")}
              </h2>

              <dl className="mt-3 space-y-3 text-body">
                <div>
                  <dt className="font-medium text-ink">{t("business.phone")}</dt>
                  <dd className="text-ink-muted tabular">
                    {business.phone !== null
                      ? // Formatted but not revealed: the number itself is
                        // behind Show number, which is what records the lead.
                        t("business.phoneHidden")
                      : t("business.notListed")}
                  </dd>
                </div>

                <div>
                  <dt className="font-medium text-ink">{t("business.website")}</dt>
                  <dd className="truncate text-ink-muted">
                    {business.website !== null ? (
                      <a
                        href={business.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {business.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      t("business.notListed")
                    )}
                  </dd>
                </div>

                {business.email !== null ? (
                  <div>
                    <dt className="font-medium text-ink">{t("business.email")}</dt>
                    <dd className="truncate text-ink-muted">{business.email}</dd>
                  </div>
                ) : null}

                {business.whatsapp !== null ? (
                  <div>
                    <dt className="font-medium text-ink">{t("business.whatsapp")}</dt>
                    <dd className="text-ink-muted tabular">
                      {formatPhone(business.whatsapp)}
                    </dd>
                  </div>
                ) : null}

                <div>
                  <dt className="font-medium text-ink">{t("business.category")}</dt>
                  <dd className="text-ink-muted">
                    {categoryHref !== null ? (
                      <Link
                        href={categoryHref}
                        className="rounded-sm text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {business.category_name}
                      </Link>
                    ) : (
                      t("business.notListed")
                    )}
                  </dd>
                </div>
              </dl>

              {/* Stated where the visitor is deciding whether to trust the
                  listing, not buried at the foot of the page. */}
              {business.verified ? (
                <p className="mt-4 border-t border-line pt-3 text-meta text-ink-subtle">
                  {t("listing.verifiedHint")}
                </p>
              ) : null}
            </Card>
          </aside>
        </div>

        {/* The one gap worth naming on the page: a visitor expects photos and
            their absence otherwise reads as a broken page. */}
        <Card className="mt-8 border-dashed bg-surface-muted p-4 shadow-none">
          <h2 className="text-card-title text-ink">{t("business.photosTitle")}</h2>
          <p className="mt-1 max-w-prose text-body text-ink-muted">
            {t("business.photosBody")}
          </p>
        </Card>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
