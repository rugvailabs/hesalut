/**
 * Navigation across one listing's owner surfaces.
 *
 * The same problem AdminNav fixed, one level down: every dashboard subpage had
 * a back-link to /dashboard and no way to reach a sibling, so an owner
 * answering a review and then checking their leads went up and down through
 * the listings index twice. With more than one listing that is worse, because
 * the index does not remember which listing they were working on.
 *
 * The count sits on Reviews for the reason AdminNav puts counts on queues: the
 * owner's next question after editing a listing is whether anything is waiting
 * on them. It is omitted rather than zeroed when it could not be loaded - no
 * badge is better than a wrong one.
 */

import Link from "next/link";

import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";

export type DashboardSection = "edit" | "leads" | "reviews" | "verification";

/** Each tab's label is dashboard.nav.<key>. */
const TABS: { key: DashboardSection; segment: string }[] = [
  { key: "edit", segment: "edit" },
  { key: "leads", segment: "leads" },
  { key: "reviews", segment: "reviews" },
  { key: "verification", segment: "verification" },
];

export default function DashboardNav({
  businessId,
  current,
  unansweredReviews,
  newLeads,
  className,
  locale,
}: {
  businessId: number;
  current: DashboardSection;
  /** Omitted when the count could not be loaded. */
  unansweredReviews?: number;
  newLeads?: number;
  className?: string;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const counts: Partial<Record<DashboardSection, number | undefined>> = {
    reviews: unansweredReviews,
    leads: newLeads,
  };

  return (
    <nav className={cn("flex flex-wrap gap-2", className)} aria-label={t("dashboard.nav.label")}>
      {TABS.map((tab) => {
        const selected = tab.key === current;
        const count = counts[tab.key];

        return (
          <Link
            key={tab.key}
            href={`/dashboard/${businessId}/${tab.segment}`}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-input px-3 py-1.5 text-body font-medium",
              "transition-colors focus-visible:outline focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "bg-brand-700 text-ink-inverse"
                : "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
            )}
          >
            {t(`dashboard.nav.${tab.key}`)}
            {count !== undefined && count > 0 ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5",
                  "text-micro tabular",
                  selected ? "bg-surface text-brand-800" : "bg-warning-bg text-warning",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
