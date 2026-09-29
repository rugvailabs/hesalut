"use client";

/**
 * Review moderation list with delete.
 *
 * Deleting is irreversible and changes a business's public rating, so it asks
 * for confirmation inline rather than firing on the first click - and the
 * confirmation names the business, because "are you sure?" on its own tells
 * you nothing about what you are about to remove.
 *
 * The row is dropped optimistically and router.refresh() reconciles, so the
 * list does not sit there showing something that no longer exists.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { AdminReviewItem } from "@/lib/types";

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

export default function AdminReviewList({
  reviews: initial,
  locale,
}: {
  reviews: AdminReviewItem[];
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();
  const [reviews, setReviews] = useState(initial);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(review: AdminReviewItem): Promise<void> {
    setError(null);
    setBusyId(review.id);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: review.id }),
      });

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : t("admin.reviewList.deleteError", { status: res.status }),
        );
        return;
      }

      setReviews((current) => current.filter((r) => r.id !== review.id));
      setConfirming(null);
      router.refresh();
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setBusyId(null);
    }
  }

  if (reviews.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold text-ink">{t("admin.reviewList.emptyTitle")}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t("admin.reviewList.emptyBody")}
        </p>
      </Card>
    );
  }

  return (
    <>
      {error !== null ? (
        <Alert locale={locale} tone="error" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {reviews.map((review) => {
          const busy = busyId === review.id;
          return (
            <li key={review.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <RatingStars locale={locale} rating={review.rating} showCount={false} />
                    {review.title !== null ? (
                      <h2 className="mt-1 font-semibold text-ink">
                        {review.title}
                      </h2>
                    ) : null}
                    <p className="text-sm text-ink-subtle">
                      {t("admin.reviewList.on")}{" "}
                      <a
                        href={`/business/${review.business_slug}`}
                        className="underline"
                      >
                        {review.business_name}
                      </a>
                    </p>
                  </div>
                  <div className="text-right text-sm text-ink-subtle">
                    <div className="break-words">{review.author_name}</div>
                    {/* Admin surface, so identifying the author is the point. */}
                    <div className="break-all text-xs">{review.author_email}</div>
                    <div className="text-xs">{formatWhen(review.created_at, locale)}</div>
                  </div>
                </div>

                {review.body !== null ? (
                  <p className="text-sm text-ink">{review.body}</p>
                ) : null}

                {review.owner_reply !== null ? (
                  <div className="rounded-md border-l-2 border-line-strong bg-surface-muted px-3 py-2">
                    <p className="text-xs font-medium text-ink-subtle">
                      {t("admin.reviewList.ownerReply")}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {review.owner_reply}
                    </p>
                  </div>
                ) : null}

                {confirming === review.id ? (
                  <Alert locale={locale} tone="warning" title={t("admin.reviewList.confirmTitle")}>
                    <p>
                      {t("admin.reviewList.confirmBody", {
                        name: review.business_name,
                      })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => remove(review)}
                      >
                        {busy
                          ? t("admin.reviewList.deleting")
                          : t("admin.reviewList.confirmDelete")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirming(null)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </Alert>
                ) : (
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirming(review.id)}
                    >
                      {t("admin.reviewList.delete")}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
