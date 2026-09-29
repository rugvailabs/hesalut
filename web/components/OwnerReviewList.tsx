"use client";

/**
 * The owner's view of their reviews, with an inline reply box under each one
 * that has no reply yet.
 *
 * A Client Component only because of the optimistic update: the reply has to
 * appear the moment it is posted, before router.refresh() re-runs the page.
 * The list is seeded from the server render, so there is no client fetch on
 * first paint.
 */

import { useState } from "react";

import OwnerReplyForm from "@/components/OwnerReplyForm";
import { RatingPill } from "@/components/ds/indicators";
import { Card } from "@/components/ds/primitives";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { BusinessReview } from "@/lib/types";

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

export default function OwnerReviewList({
  businessId,
  reviews: initialReviews,
  locale,
}: {
  businessId: number;
  reviews: BusinessReview[];
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const [reviews, setReviews] = useState(initialReviews);

  /** Patch one review in place so its reply shows without a round trip. */
  function applyReply(reviewId: number, reply: string): void {
    setReviews((current) =>
      current.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              owner_reply: reply,
              owner_replied_at: new Date().toISOString(),
            }
          : review,
      ),
    );
  }

  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id}>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <RatingPill rating={review.rating} size="sm" locale={locale} />
                {review.title !== null ? (
                  <h2 className="mt-1 font-semibold text-ink">
                    {review.title}
                  </h2>
                ) : null}
              </div>
              <div className="text-right text-body text-ink-subtle">
                <div>{review.author_name}</div>
                <div>{formatWhen(review.created_at, locale)}</div>
              </div>
            </div>

            {review.body !== null ? (
              <p className="mt-2 text-body text-ink-muted">{review.body}</p>
            ) : null}

            {review.owner_reply !== null ? (
              <div className="mt-3 rounded-input border-l-2 border-line-strong bg-surface-muted px-3 py-2">
                <p className="text-meta font-medium text-ink-subtle">
                  {t("dashboard.reviews.yourReply")}
                  {review.owner_replied_at !== null
                    ? ` · ${formatWhen(review.owner_replied_at, locale)}`
                    : ""}
                </p>
                <p className="mt-1 text-body text-ink-muted">{review.owner_reply}</p>
              </div>
            ) : (
              <OwnerReplyForm
                businessId={businessId}
                reviewId={review.id}
                onReplied={(reply) => applyReply(review.id, reply)}
                locale={locale}
              />
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
