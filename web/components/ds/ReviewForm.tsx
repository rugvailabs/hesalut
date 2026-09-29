"use client";

/**
 * Leave a review on a public listing.
 *
 * The star picker is a real radio group, not five buttons wired to state. That
 * is what gives it keyboard arrow-key navigation, a single tab stop, and an
 * accessible name per option for free - all of which a div-based rating
 * control has to reimplement and usually does not.
 *
 * Hover and focus preview the rating by filling stars up to the one under the
 * pointer, which is the convention people expect; the checked value is what
 * submits, so a stray mouse-out never changes what was chosen.
 *
 * On success the page is refreshed rather than the new review being pushed
 * into local state: posting a review recalculates the listing's rating and
 * count on the server, so re-rendering is what keeps the headline, the
 * histogram and the list agreeing with each other.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Star } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { FIELD, HINT, LABEL, TEXTAREA } from "@/components/ds/form";
import { Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";

const RATINGS = [1, 2, 3, 4, 5] as const;

/**
 * The words that make a star count mean the same thing to everyone, as
 * dictionary keys resolved in the component.
 */
const RATING_LABELS: Record<number, string> = {
  1: "discover.review.poor",
  2: "discover.review.fair",
  3: "discover.review.good",
  4: "discover.review.veryGood",
  5: "discover.review.excellent",
};

export default function ReviewForm({
  businessId,
  businessName,
  locale = "en",
}: {
  businessId: number;
  businessName: string;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();

  const [rating, setRating] = useState(0);
  const [preview, setPreview] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // What the stars paint: the pointer/focus position if there is one,
  // otherwise the committed choice.
  const shown = preview || rating;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (rating === 0) {
      setError(t("discover.review.chooseRating"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          rating,
          title: title.trim() || null,
          body: body.trim() || null,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("discover.review.httpError", { status: res.status });
        setError(detail);
        return;
      }

      setDone(true);
      // Re-runs the Server Components, so the rating, the histogram and the
      // list all pick up the review that was just written.
      router.refresh();
    } catch {
      setError(t("business.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="border-success/30 bg-success-bg p-4">
        <div role="status">
          <h3 className="text-card-title text-success">
            {t("discover.review.thanksTitle")}
          </h3>
          <p className="mt-1 text-body text-ink-muted">
            {t("discover.review.thanksBody", { name: businessName })}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-card-title text-ink">
        {t("discover.review.heading", { name: businessName })}
      </h3>
      <p className={HINT}>{t("discover.review.hint")}</p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <fieldset
          // The whole group loses its hover preview together, so leaving via
          // any star restores the committed value rather than the last one
          // the pointer happened to cross.
          onMouseLeave={() => setPreview(0)}
        >
          <legend className={LABEL}>{t("discover.review.yourRating")}</legend>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-0.5">
              {RATINGS.map((value) => (
                <label
                  key={value}
                  onMouseEnter={() => setPreview(value)}
                  className={cn(
                    "cursor-pointer rounded-sm p-0.5",
                    // focus-within, because the input taking focus is visually
                    // hidden - without this the ring never appears and the
                    // group cannot be used by keyboard.
                    "focus-within:outline focus-within:outline-2",
                    "focus-within:outline-offset-2 focus-within:outline-ring",
                  )}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => {
                      setRating(value);
                      setError(null);
                    }}
                    onFocus={() => setPreview(value)}
                    onBlur={() => setPreview(0)}
                    className="sr-only"
                  />
                  <Star
                    aria-hidden="true"
                    className={cn(
                      "size-7 transition-colors",
                      value <= shown
                        ? "fill-rating text-rating"
                        : "fill-transparent text-ink-faint",
                    )}
                  />
                  {/* The accessible name for this option. */}
                  <span className="sr-only">
                    {t("discover.review.starOption", {
                      stars:
                        value === 1
                          ? t("business.oneStar")
                          : t("business.starCount", { stars: value }),
                      label: t(RATING_LABELS[value]),
                    })}
                  </span>
                </label>
              ))}
            </div>

            <span
              aria-hidden="true"
              className={cn(
                "text-body",
                shown > 0 ? "text-ink-muted" : "text-ink-subtle",
              )}
            >
              {shown > 0 ? t(RATING_LABELS[shown]) : t("discover.review.tapStar")}
            </span>
          </div>
        </fieldset>

        <div>
          <label htmlFor="review-title" className={LABEL}>
            {t("discover.review.headline")}{" "}
            <span className="font-normal">{t("discover.review.optional")}</span>
          </label>
          <input
            id="review-title"
            type="text"
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("discover.review.headlinePlaceholder")}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="review-body" className={LABEL}>
            {t("discover.review.body")}{" "}
            <span className="font-normal">{t("discover.review.optional")}</span>
          </label>
          <textarea
            id="review-body"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("discover.review.bodyPlaceholder")}
            className={TEXTAREA}
          />
          <p className={HINT}>
            {body.length > 0
              ? t("discover.review.charCount", { count: body.length })
              : t("discover.review.charLimit")}
          </p>
        </div>

        {error !== null ? (
          <Alert tone="error" locale={locale}>
            {error}
          </Alert>
        ) : null}

        <Button type="submit" disabled={submitting}>
          {submitting ? t("discover.review.posting") : t("discover.review.post")}
        </Button>
      </form>
    </Card>
  );
}
