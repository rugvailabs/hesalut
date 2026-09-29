/**
 * Breadcrumbs, empty states, and the listing skeleton.
 *
 * The skeleton matches ListingCard's real geometry - same monogram square,
 * same three text rows, same button strip. A skeleton that does not match what
 * replaces it produces a visible jump on load, which is worse than no skeleton
 * at all.
 */

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  SearchX,
  XCircle,
} from "lucide-react";

import { Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ Breadcrumbs */

export interface Crumb {
  label: string;
  /** Omit on the last crumb: the page you are on is not a link to itself. */
  href?: string;
  /**
   * Keep the crumb in the markup but don't display it (display: none). Its
   * separator goes with it, since each crumb carries its own.
   */
  hidden?: boolean;
}

export function Breadcrumbs({
  items,
  className,
  label = "Breadcrumb",
}: {
  items: Crumb[];
  className?: string;
  /** The landmark's accessible name - pass a translation where there is one. */
  label?: string;
}): JSX.Element {
  return (
    <nav aria-label={label} className={cn("text-meta", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-ink-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className={cn("flex items-center gap-1", item.hidden && "hidden")}
            >
              {item.href !== undefined && !last ? (
                <Link
                  href={item.href}
                  className="rounded-sm hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="text-ink-muted">
                  {item.label}
                </span>
              )}
              {!last ? (
                <ChevronRight className="size-3.5 text-ink-faint" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ----------------------------------------------------------------- Alert */

/**
 * One banner for every "something went wrong" and every "that worked".
 *
 * A banner rather than a toast, deliberately: these are almost always attached
 * to a form the person is still looking at, and a toast that disappears takes
 * the explanation with it before it can be acted on.
 *
 * The tone is carried by the icon and the words as well as the colour, so it
 * survives monochrome and colour-blindness. Errors interrupt (role=alert);
 * everything else is announced politely.
 */
const ALERT_TONES = {
  error: { className: "border-danger/30 bg-danger-bg text-danger", Icon: XCircle, label: "Error" },
  warning: {
    className: "border-warning/30 bg-warning-bg text-warning",
    Icon: AlertTriangle,
    label: "Warning",
  },
  success: {
    className: "border-success/30 bg-success-bg text-success",
    Icon: CheckCircle2,
    label: "Success",
  },
  info: { className: "border-line bg-surface-muted text-ink-muted", Icon: Info, label: "Note" },
} as const;

export type AlertTone = keyof typeof ALERT_TONES;

export function Alert({
  tone = "error",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  const { className: toneClass, Icon, label } = ALERT_TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-input border px-3 py-2.5 text-body",
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <span className="sr-only">{label}: </span>
        {title !== undefined ? <p className="font-semibold">{title}</p> : null}
        <div className={title !== undefined ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: { label: string; href: string };
  icon?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <Card className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-ink-faint">
        {icon ?? <SearchX className="size-5" aria-hidden="true" />}
      </span>
      <h2 className="text-section-heading text-ink">{title}</h2>
      {body !== undefined ? (
        <p className="max-w-prose text-body text-ink-muted">{body}</p>
      ) : null}
      {action !== undefined ? (
        <Button asChild variant="secondary" size="sm" className="mt-1">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------- ListingCardSkeleton */

/**
 * One placeholder bar.
 *
 * A shimmer rather than a pulse: a pulsing block reads as something broken
 * flashing, where a sweep reads as motion in one direction and so as progress.
 * It respects prefers-reduced-motion by dropping to a plain block, which is
 * still a correctly-shaped placeholder.
 *
 * Exported because every loading.tsx was declaring its own copy.
 */
export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded-sm bg-surface-muted",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-line/60 after:to-transparent",
        "motion-reduce:after:hidden",
        className,
      )}
    />
  );
}

/**
 * Wraps a set of skeletons in the one announcement they should make.
 *
 * Without this each bar is its own aria-hidden div inside a live region and a
 * screen reader hears nothing useful; with it, "Loading your listings" is said
 * once and the bars stay decorative.
 */
export function SkeletonRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const Bar = Skeleton;

export function ListingCardSkeleton(): JSX.Element {
  return (
    <Card className="flex gap-4 p-4" aria-hidden="true">
      <Bar className="hidden size-16 shrink-0 rounded-card sm:block" />
      <div className="flex-1 space-y-2">
        <Bar className="h-4 w-2/5" />
        <Bar className="h-3 w-1/3" />
        <Bar className="h-3 w-24" />
        <Bar className="h-3 w-full" />
        <div className="flex gap-2 pt-2">
          <Bar className="h-9 w-32 rounded-input" />
          <Bar className="h-9 w-24 rounded-input" />
        </div>
      </div>
    </Card>
  );
}

/** A list of skeletons, announced once rather than per row. */
export function ListingListSkeleton({
  count = 4,
  label = "Loading listings",
}: {
  count?: number;
  label?: string;
}): JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}
