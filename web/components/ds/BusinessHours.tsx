/**
 * The week's opening hours, with today marked.
 *
 * Reads the same shape getOpenState() does - {"mon": [["09:00","17:00"]]} -
 * and renders the seven days in the order the locale starts its week, which is
 * Sunday under en-CA and Monday under fr-CA. Hardcoding Monday-first would be
 * wrong for half this directory's audience.
 *
 * A day the business does not open is shown as "Closed" rather than omitted:
 * a table with Tuesday missing reads as an oversight, one that says Tuesday is
 * closed reads as a fact. Multiple ranges in a day - the lunch-break split
 * that is normal for a restaurant - are stacked rather than flattened into a
 * single span that would claim the business is open through the gap.
 *
 * This renders only when the listing genuinely has hours. The caller decides;
 * see the profile page, which falls back to OpenStatus's "Hours not listed".
 */

import { Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import { formatTime, getOpenState, type OpeningHours } from "@/lib/opening-hours";

/** Index 0-6 is Sunday-Saturday, matching Date.getDay() and the storage keys. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * The weekday index each locale starts on. Intl exposes this properly only
 * through `Locale.prototype.getWeekInfo`, which is not in every runtime this
 * builds against, so the two locales this app actually ships are stated.
 */
const FIRST_DAY: Record<Locale, number> = { en: 0, fr: 1 };

function dayLabel(index: number, intl: string): string {
  // 2024-01-07 was a Sunday, so the index maps straight onto the week.
  return new Intl.DateTimeFormat(intl, { weekday: "long" }).format(
    new Date(2024, 0, 7 + index),
  );
}

export default function BusinessHours({
  hours,
  locale = "en",
  className,
}: {
  hours: OpeningHours;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];

  const today = new Date().getDay();
  const start = FIRST_DAY[locale];
  const order = Array.from({ length: 7 }, (_, offset) => (start + offset) % 7);

  const state = getOpenState(hours, new Date(), intl);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <table className="w-full text-body">
        <caption className="sr-only">{t("business.hours")}</caption>
        <tbody>
          {order.map((index) => {
            const ranges = hours[DAY_KEYS[index]] ?? [];
            const isToday = index === today;

            return (
              <tr
                key={DAY_KEYS[index]}
                className={cn(
                  "border-b border-line last:border-b-0",
                  isToday && "bg-surface-muted",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "px-4 py-2 text-left font-normal",
                    isToday ? "font-medium text-ink" : "text-ink-muted",
                  )}
                >
                  {dayLabel(index, intl)}
                  {isToday ? (
                    <span className="ml-2 text-micro uppercase text-ink-muted">
                      {t("business.hoursToday")}
                    </span>
                  ) : null}
                </th>
                <td className="px-4 py-2 text-right tabular">
                  {ranges.length === 0 ? (
                    <span className="text-ink-muted">{t("business.closedDay")}</span>
                  ) : (
                    <span className="inline-flex flex-col gap-0.5">
                      {ranges.map(([from, to], rangeIndex) => (
                        <span key={rangeIndex} className="text-ink">
                          {formatTime(from, intl)} &ndash; {formatTime(to, intl)}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* The one thing the stored data cannot tell us. Said once, under the
          table, rather than beside every row. */}
      {state.status !== "unknown" ? (
        <p className="border-t border-line bg-surface-muted px-4 py-2 text-meta text-ink-muted">
          {t("discover.business.localHours")}
        </p>
      ) : null}
    </Card>
  );
}
