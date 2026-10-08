/**
 * How long a submission has been waiting for a reviewer, as a tag.
 *
 * The review queues list the newest first, so the one that has waited longest
 * sinks to the bottom. This tag is what keeps it visible: it ages from neutral
 * to amber at three days to red at seven, and always says the time in words, so
 * the colour is never the only signal.
 *
 * Pure and client-safe: it is used by a server page and by the client-side
 * moderation list.
 */

import { tFor, type Locale } from "@/lib/i18n";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Days at which the tag turns amber and then red. */
const AMBER_DAYS = 3;
const RED_DAYS = 7;

export default function WaitingTag({
  since,
  locale,
}: {
  /** When the submission arrived (ISO timestamp). */
  since: string;
  locale: Locale;
}): JSX.Element | null {
  const t = tFor(locale);
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return null;

  const elapsed = Math.max(0, Date.now() - then);
  const days = Math.floor(elapsed / DAY);
  const hours = Math.floor(elapsed / HOUR);

  const label =
    days >= 1
      ? t("admin.waitingTag.days", { count: days })
      : hours >= 1
        ? t("admin.waitingTag.hours", { count: hours })
        : t("admin.waitingTag.justIn");

  const tone =
    days >= RED_DAYS
      ? "bg-danger-bg text-danger ring-danger/30"
      : days >= AMBER_DAYS
        ? "bg-warning-bg text-warning ring-warning/30"
        : "bg-surface-muted text-ink ring-line";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {label}
    </span>
  );
}
