"use client";

/**
 * One business in the /explore results.
 *
 * No photos: the backend has none, so the category glyph stands in and a card
 * reads at a glance by trade. What it shows comes from the search row itself
 * - rating and reviews, verification, open now (when hours are listed), price
 * level (when set), "Recently added" (listed in the last week), and contact.
 *
 * Clicking anywhere on the card that is not itself a link or button opens the
 * quick view. That is for pointer users; the name is a real button, so
 * keyboard and screen-reader users get the same action without a clickable
 * <div>. Hovering (or tabbing into) the card lifts it slightly and lets the
 * description run longer; every action is also visible without hover, since
 * touch screens have none.
 */

import Link from "next/link";
import { ArrowRight, Eye, Globe, MapPin, Navigation, Phone, Sparkles } from "lucide-react";

import CategoryIcon from "@/components/categories/CategoryIcon";
import { useExploreT } from "@/components/explore/ExploreProviders";
import FavoriteButton from "@/components/explore/FavoriteButton";
import { OpenStatus, PlacementBadge, RatingPill, VerifiedBadge } from "@/components/ds/indicators";
import { Badge, Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { directionsUrl, displayHost } from "@/lib/explore";
import {
  formatDistance,
  formatLocality,
  formatPhone,
  formatPostalCode,
  telHref,
} from "@/lib/format";
import type { BusinessListItem } from "@/lib/types";

/** "Recently added" means listed within this many days. */
const RECENT_DAYS = 7;

function isRecent(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const age = Date.now() - new Date(createdAt).getTime();
  return age >= 0 && age < RECENT_DAYS * 24 * 60 * 60 * 1000;
}

export default function ResultCard({
  business,
  layout,
  saved,
  onToggleSaved,
  onPreview,
  onCall,
}: {
  business: BusinessListItem;
  layout: "grid" | "list";
  saved: boolean;
  onToggleSaved: () => void;
  onPreview: () => void;
  onCall: () => void;
}): JSX.Element {
  const { t, locale, intl } = useExploreT();
  const distance = formatDistance(business.distance_km, intl);
  const phone = formatPhone(business.phone);
  const tel = telHref(business.phone);
  const postal = formatPostalCode(business.postal_code);
  const place = [business.address, formatLocality(business.city, business.province), postal]
    .filter(Boolean)
    .join(", ");
  const hasHours = business.opening_hours != null && Object.keys(business.opening_hours).length > 0;
  const recent = isRecent(business.created_at);

  return (
    <Card
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button")) return;
        onPreview();
      }}
      className={cn(
        "group flex h-full cursor-pointer flex-col gap-3 p-4",
        "transition-[border-color,box-shadow,transform] duration-200 hover:border-line-strong hover:shadow-overlay focus-within:border-line-strong",
        "motion-safe:hover:-translate-y-0.5",
        layout === "list" && "sm:flex-row sm:items-start",
        business.subscription_tier === "annual" && "border-l-4 border-l-sponsored",
        business.subscription_tier === "monthly" && "border-l-4 border-l-promoted",
      )}
    >
      <div className="flex items-start gap-3 sm:contents">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100"
        >
          <CategoryIcon slug={business.category_slug} className="size-6" />
        </span>
        {/* Mobile keeps the heart beside the icon; wider screens put it
            top-right of the body. */}
        <FavoriteButton
          saved={saved}
          name={business.name}
          onToggle={onToggleSaved}
          className="ml-auto sm:hidden"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-card-title text-ink">
              <button
                type="button"
                onClick={onPreview}
                className="text-left hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {business.name}
              </button>
            </h2>
            <p className="mt-0.5 text-meta text-ink-subtle">
              {business.category_name}
              {business.price_range ? (
                <>
                  {" · "}
                  <span className="tabular font-medium text-ink-muted" aria-label={t("card.price", { price: business.price_range })}>
                    {business.price_range}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <FavoriteButton
            saved={saved}
            name={business.name}
            onToggle={onToggleSaved}
            className="hidden sm:inline-flex"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RatingPill
            rating={business.rating}
            reviewCount={business.review_count}
            size="sm"
            locale={locale}
          />
          <PlacementBadge tier={business.subscription_tier} locale={locale} />
          <VerifiedBadge implied locale={locale} />
          {recent ? (
            <Badge tone="brand">
              <Sparkles className="size-3" aria-hidden="true" />
              {t("card.recentlyAdded")}
            </Badge>
          ) : null}
        </div>

        {hasHours ? <OpenStatus hours={business.opening_hours} locale={locale} className="mt-2" /> : null}

        {business.description ? (
          <p className="mt-2 line-clamp-2 text-body text-ink-muted group-focus-within:line-clamp-4 group-hover:line-clamp-4">
            {business.description}
          </p>
        ) : null}

        <ul className="mt-3 space-y-1.5 text-meta text-ink-muted">
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
            <span className="min-w-0">
              {place}
              {distance !== null ? (
                <span className="tabular font-medium text-ink">
                  {" · "}
                  {t("card.away", { distance })}
                </span>
              ) : null}
            </span>
          </li>
          {phone !== null ? (
            <li className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
              <span className="tabular">{phone}</span>
            </li>
          ) : null}
          {business.website ? (
            <li className="flex items-center gap-2">
              <Globe className="size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
              <a
                href={business.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="truncate text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {displayHost(business.website)}
                <span className="sr-only"> {t("card.newTab")}</span>
              </a>
            </li>
          ) : null}
        </ul>

        {/* Calls to action: the profile, a call, the quick view, the way there. */}
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          <Button asChild size="sm">
            <Link href={`/business/${business.slug}`}>
              {t("card.viewDetails")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          {tel !== null ? (
            <Button asChild variant="secondary" size="sm">
              <a href={tel} onClick={onCall} aria-label={t("card.callName", { name: business.name })}>
                <Phone aria-hidden="true" />
                {t("card.call")}
              </a>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onPreview}>
            <Eye aria-hidden="true" />
            {t("card.quickView")}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={directionsUrl(business)} target="_blank" rel="noopener noreferrer">
              <Navigation aria-hidden="true" />
              <span aria-hidden="true">{t("card.directions")}</span>
              <span className="sr-only">
                {t("card.directionsTo", { name: business.name })} {t("card.newTab")}
              </span>
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
