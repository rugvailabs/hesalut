/**
 * Formatting for bookings. Times are stored in UTC and shown in the business's
 * own time zone, with the zone abbreviation, so a customer in another zone is
 * not misled about when the visit is.
 */

import type { PartOfDay } from "@/lib/types";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "Tue, Oct 6, 2026, 2:30 p.m. PDT" in the business's zone. */
export function formatBookingTime(iso: string, zone: string, intl: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleString(intl, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
      timeZoneName: "short",
    });
  } catch {
    return date.toLocaleString(intl);
  }
}

/** "Tue, Oct 6" in the business's zone. */
export function formatBookingDay(iso: string, zone: string, intl: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleDateString(intl, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: zone,
    });
  } catch {
    return date.toLocaleDateString(intl);
  }
}

/** "2:30 p.m." in the business's zone. */
export function formatBookingClock(iso: string, zone: string, intl: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleTimeString(intl, { hour: "numeric", minute: "2-digit", timeZone: zone });
  } catch {
    return date.toLocaleTimeString(intl);
  }
}

/** "$120.00", or null for "price on request". */
export function formatPrice(cents: number | null, intl: string): string | null {
  if (cents === null) return null;
  return new Intl.NumberFormat(intl, { style: "currency", currency: "CAD" }).format(cents / 100);
}

/**
 * Whether the business is open at all on a calendar date ("YYYY-MM-DD").
 * True when it lists no hours: unknown is not closed. The date is read as a
 * plain calendar day, never through a time zone, so it cannot slip a day.
 */
export function isOpenOn(
  hours: Record<string, [string, string][]> | null,
  isoDate: string,
): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const ranges = hours[DAYS[weekday]] ?? [];
  return ranges.length > 0;
}

/** Today plus `days`, as "YYYY-MM-DD" in the browser's calendar. */
export function dayFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const PARTS: PartOfDay[] = ["morning", "afternoon", "evening"];
