/**
 * /account/bookings - the signed-in customer's booking requests and bookings.
 *
 * Reading the list is what settles time-based changes on the server (an
 * unanswered request becomes "expired" here), so the page always shows the
 * current state without any background job.
 */

import MyBookings from "@/components/booking/MyBookings";
import { EmptyState } from "@/components/ds/feedback";
import { getMyBookings } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage(): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireUser("/account/bookings");
  const bookings = await getMyBookings();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{t("booking.mine.title")}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">{t("booking.mine.subtitle")}</p>
      {bookings.length === 0 ? (
        <EmptyState
          title={t("booking.mine.empty")}
          action={{ label: t("booking.mine.browse"), href: "/search" }}
        />
      ) : (
        <MyBookings initial={bookings} locale={locale} />
      )}
    </div>
  );
}
