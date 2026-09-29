"use client";

/**
 * A business at a glance, without leaving the dashboard: hours, the full
 * description, the three newest reviews and every way to get in touch.
 *
 * A dialog in the ARIA sense - focus moves in on open, Tab stays inside,
 * Escape and the backdrop close it, and focus goes back to whatever opened
 * it. The page behind does not scroll while it is open.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Navigation,
  Phone,
  Star,
  X,
} from "lucide-react";

import CategoryIcon from "@/components/categories/CategoryIcon";
import MapEmbed from "@/components/MapEmbed";
import { useExploreT } from "@/components/explore/ExploreProviders";
import FavoriteButton from "@/components/explore/FavoriteButton";
import BusinessHours from "@/components/ds/BusinessHours";
import { Skeleton } from "@/components/ds/feedback";
import { OpenStatus, RatingPill, VerifiedBadge } from "@/components/ds/indicators";
import { Button } from "@/components/ds/primitives";
import { directionsUrl, displayHost } from "@/lib/explore";
import {
  formatAddress,
  formatDate,
  formatDistance,
  formatPhone,
  telHref,
} from "@/lib/format";
import type { BusinessDetail, BusinessReview, BusinessReviewSummary } from "@/lib/types";

interface Preview {
  business: BusinessDetail;
  reviews: BusinessReview[] | null;
  summary: BusinessReviewSummary | null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function whatsappHref(value: string): string {
  return `https://wa.me/${value.replace(/\D/g, "")}`;
}

export default function PreviewModal({
  slug,
  distanceKm,
  saved,
  onToggleSaved,
  onClose,
}: {
  slug: string;
  /** From the search row, when the search had a point. */
  distanceKm: number | null;
  saved: boolean;
  onToggleSaved: (businessId: number) => void;
  onClose: () => void;
}): JSX.Element {
  const { t, locale } = useExploreT();
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/explore/business/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as Preview | null;
        if (!res.ok || body === null) {
          // An i18n key, so the message follows a language switch.
          throw new Error(res.status === 404 ? "preview.gone" : "preview.error");
        }
        setData(body);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error && cause.message.startsWith("preview.")
            ? cause.message
            : "preview.error",
        );
      });
    return () => controller.abort();
  }, [slug, attempt]);

  // Focus in, scroll lock, focus back out.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const business = data?.business;
  const titleId = "preview-title";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={data === null && error === null}
        onKeyDown={onKeyDown}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card border border-line bg-surface shadow-overlay sm:rounded-card"
      >
        {/* ---------------------------------------------------------- header */}
        <div className="flex items-start gap-3 border-b border-line p-4 sm:p-5">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-700"
          >
            {business?.category_slug ? (
              <CategoryIcon slug={business.category_slug} className="size-6" />
            ) : (
              <Star className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-section-heading text-ink">
              {business?.name ?? (error !== null ? t("preview.title") : t("preview.loading"))}
            </h2>
            {business ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-meta text-ink-muted">{business.category_name}</span>
                <RatingPill
                  rating={business.rating}
                  reviewCount={business.review_count}
                  size="sm"
                  locale={locale}
                />
                <VerifiedBadge implied locale={locale} />
              </div>
            ) : null}
          </div>
          {business ? (
            <FavoriteButton
              saved={saved}
              name={business.name}
              onToggle={() => onToggleSaved(business.id)}
            />
          ) : null}
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("preview.close")}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        {/* ------------------------------------------------------------ body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error !== null ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="size-6 text-danger" aria-hidden="true" />
              <p className="text-body text-ink">{t(error)}</p>
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {t("results.tryAgain")}
              </Button>
            </div>
          ) : business === undefined || data === null ? (
            <div role="status" className="space-y-4">
              <span className="sr-only">{t("preview.loading")}</span>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="preview-about">
                <h3 id="preview-about" className="text-micro uppercase text-ink-subtle">
                  {t("preview.about")}
                </h3>
                <p className="mt-1.5 whitespace-pre-line text-body text-ink-muted">
                  {business.description ?? t("preview.noDescription")}
                </p>
                {business.tags && business.tags.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {business.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-pill bg-surface-muted px-2 py-0.5 text-meta text-ink-muted"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <div className="grid gap-6 sm:grid-cols-2">
                <section aria-labelledby="preview-contact">
                  <h3 id="preview-contact" className="text-micro uppercase text-ink-subtle">
                    {t("preview.contact")}
                  </h3>
                  <ContactList business={business} distanceKm={distanceKm} />
                </section>

                <section aria-labelledby="preview-hours">
                  <h3
                    id="preview-hours"
                    className="flex items-center gap-1.5 text-micro uppercase text-ink-subtle"
                  >
                    <Clock className="size-3.5" aria-hidden="true" />
                    {t("preview.hours")}
                  </h3>
                  <div className="mt-1.5">
                    <OpenStatus hours={business.opening_hours} showUnknown locale={locale} />
                  </div>
                  {business.opening_hours && Object.keys(business.opening_hours).length > 0 ? (
                    <BusinessHours hours={business.opening_hours} className="mt-2" locale={locale} />
                  ) : null}
                </section>
              </div>

              {business.latitude !== null && business.longitude !== null ? (
                <section aria-labelledby="preview-map">
                  <h3 id="preview-map" className="sr-only">
                    {t("preview.map")}
                  </h3>
                  <div className="h-48 overflow-hidden rounded-card border border-line">
                    <MapEmbed locale={locale}
                      latitude={business.latitude}
                      longitude={business.longitude}
                      name={business.name}
                      className="h-48"
                    />
                  </div>
                </section>
              ) : null}

              <ReviewsExcerpt
                reviews={data.reviews}
                summary={data.summary}
                slug={business.slug}
              />
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------- footer */}
        {business ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/business/${business.slug}#enquire`}>
                <MessageSquareText aria-hidden="true" />
                {t("preview.enquire")}
              </Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link href={`/business/${business.slug}`}>
                {t("preview.profile")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContactList({
  business,
  distanceKm,
}: {
  business: BusinessDetail;
  distanceKm: number | null;
}): JSX.Element {
  const { t, intl } = useExploreT();
  const phone = formatPhone(business.phone);
  const tel = telHref(business.phone);
  const address = formatAddress(business);
  const distance = formatDistance(distanceKm, intl);
  const linkClass =
    "text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <ul className="mt-1.5 space-y-2 text-body text-ink-muted">
      {address ? (
        <li className="flex items-start gap-2">
          <MapPin className="mt-1 size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <span>
            {address}
            {distance !== null ? (
              <span className="tabular font-medium text-ink">
                {" · "}
                {t("card.away", { distance })}
              </span>
            ) : null}
            <br />
            <a
              className={linkClass}
              href={directionsUrl({
                name: business.name,
                address: business.address,
                city: business.city,
                province: business.province,
                latitude: business.latitude,
                longitude: business.longitude,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="mr-1 inline size-3.5" aria-hidden="true" />
              {t("preview.getDirections")}
              <span className="sr-only"> {t("card.newTab")}</span>
            </a>
          </span>
        </li>
      ) : null}
      {phone !== null && tel !== null ? (
        <li className="flex items-center gap-2">
          <Phone className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <a className={`${linkClass} tabular`} href={tel}>
            {phone}
          </a>
        </li>
      ) : null}
      {business.whatsapp ? (
        <li className="flex items-center gap-2">
          <MessageCircle className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <a
            className={linkClass}
            href={whatsappHref(business.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("preview.whatsapp")}
            <span className="sr-only"> {t("card.newTab")}</span>
          </a>
        </li>
      ) : null}
      {business.email ? (
        <li className="flex items-center gap-2">
          <Mail className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <a className={`${linkClass} break-all`} href={`mailto:${business.email}`}>
            {business.email}
          </a>
        </li>
      ) : null}
      {business.website ? (
        <li className="flex items-center gap-2">
          <Globe className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <a
            className={`${linkClass} break-all`}
            href={business.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {displayHost(business.website)}
            <span className="sr-only"> {t("card.newTab")}</span>
          </a>
        </li>
      ) : null}
      {!address && tel === null && !business.whatsapp && !business.email && !business.website ? (
        <li>{t("preview.noContact")}</li>
      ) : null}
    </ul>
  );
}

function ReviewsExcerpt({
  reviews,
  summary,
  slug,
}: {
  reviews: BusinessReview[] | null;
  summary: BusinessReviewSummary | null;
  slug: string;
}): JSX.Element {
  const { t, intl } = useExploreT();
  return (
    <section aria-labelledby="preview-reviews">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="preview-reviews" className="text-micro uppercase text-ink-subtle">
          {t("preview.reviews")}
        </h3>
        {summary !== null && summary.review_count > 0 ? (
          <Link
            href={`/business/${slug}#review`}
            className="text-meta text-brand-700 hover:underline"
          >
            {t("preview.allReviews")}
          </Link>
        ) : null}
      </div>

      {reviews === null ? (
        <p className="mt-1.5 text-body text-ink-muted">{t("preview.reviewsUnavailable")}</p>
      ) : reviews.length === 0 ? (
        <p className="mt-1.5 text-body text-ink-muted">
          {/* Not "be the first": the headline count comes from the listing
              row, which can claim reviews that have no written text here. */}
          {t("preview.noReviews")}{" "}
          <Link href={`/business/${slug}#review`} className="text-brand-700 hover:underline">
            {t("preview.writeReview")}
          </Link>
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-input border border-line p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
                <span
                  className="inline-flex items-center gap-0.5 text-rating-ink"
                  aria-label={t("preview.stars", { count: review.rating })}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      aria-hidden="true"
                      className={
                        i < review.rating ? "size-3.5 fill-rating text-rating" : "size-3.5 text-line-strong"
                      }
                    />
                  ))}
                </span>
                <span className="font-medium text-ink">{review.author_name}</span>
                <span className="text-ink-subtle">{formatDate(review.created_at, intl)}</span>
              </div>
              {review.title ? (
                <p className="mt-1 text-body font-medium text-ink">{review.title}</p>
              ) : null}
              {review.body ? (
                <p className="mt-0.5 line-clamp-3 text-body text-ink-muted">{review.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
