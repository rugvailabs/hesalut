/**
 * Five-star rating readout.
 *
 * `rating` is nullable on the API because NULL means "no reviews yet", which
 * is not the same as 0.0. That case renders as text rather than five empty
 * stars, which would read as a genuinely terrible score.
 *
 * The stars are decorative: the accessible name comes from a single aria-label
 * on the wrapper, so a screen reader hears "Rated 4.7 out of 5 from 218
 * reviews" instead of five separate glyphs.
 */

import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";

const FULL = "★";
const EMPTY = "☆";

export default function RatingStars({
  rating,
  reviewCount,
  showCount = true,
  locale = "en",
  className = "",
}: {
  rating: number | null;
  reviewCount?: number;
  showCount?: boolean;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];

  if (rating === null) {
    return (
      <span className={`text-sm text-slate-500 ${className}`.trim()}>
        {t("listing.noReviews")}
      </span>
    );
  }

  // Clamp defensively: a bad value should not render six stars.
  const value = Math.max(0, Math.min(5, rating));
  const rounded = Math.round(value);

  const shown = value.toLocaleString(intl, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const label =
    reviewCount === undefined
      ? t("discover.ratingStars.rated", { value: shown })
      : t("discover.ratingStars.ratedFrom", {
          value: shown,
          count: reviewCount.toLocaleString(intl),
        });

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`.trim()}
      aria-label={label}
    >
      <span aria-hidden="true" className="text-amber-500">
        {FULL.repeat(rounded)}
        <span className="text-slate-300">{EMPTY.repeat(5 - rounded)}</span>
      </span>
      <span aria-hidden="true" className="text-sm font-medium text-slate-900">
        {shown}
      </span>
      {showCount && reviewCount !== undefined ? (
        <span aria-hidden="true" className="text-sm text-slate-500">
          ({reviewCount.toLocaleString(intl)})
        </span>
      ) : null}
    </span>
  );
}
