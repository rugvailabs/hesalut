import Link from "next/link";

import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";

/**
 * Navigation across the admin surfaces.
 *
 * Before this each admin page had a back-link to the overview and no way to
 * reach a sibling queue, so clearing listings then verifications meant going
 * up and down through the overview twice. The counts are on the tabs because a
 * moderator's next question after finishing one queue is whether another has
 * anything in it.
 */

type AdminSection =
  | "overview"
  | "listings"
  | "verifications"
  | "reviews"
  | "leads"
  | "bookings"
  | "search";

// Labels are admin.nav.<key>.
const TABS: { key: AdminSection; href: string }[] = [
  { key: "overview", href: "/admin" },
  { key: "listings", href: "/admin/listings" },
  { key: "verifications", href: "/admin/verifications" },
  { key: "reviews", href: "/admin/reviews" },
  { key: "leads", href: "/admin/leads" },
  { key: "bookings", href: "/admin/bookings" },
  { key: "search", href: "/admin/search-analytics" },
];

export default function AdminNav({
  current,
  pendingListings,
  pendingVerifications,
  className,
  locale,
}: {
  current: AdminSection;
  /** Omitted when the count could not be loaded - no badge is better than a wrong one. */
  pendingListings?: number;
  pendingVerifications?: number;
  className?: string;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const counts: Partial<Record<AdminSection, number | undefined>> = {
    listings: pendingListings,
    verifications: pendingVerifications,
  };

  // mb-5 stays the default so the five pages that call this with no props
    // keep the spacing they were built against; a caller can override it.
  return (
    <nav className={cn("mb-5 flex flex-wrap gap-2", className)} aria-label={t("admin.nav.label")}>
      {TABS.map((tab) => {
        const selected = tab.key === current;
        const count = counts[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
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
            {t(`admin.nav.${tab.key}`)}
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
