/**
 * /admin/bookings - every booking request in the directory.
 *
 * For two jobs: looking into a complaint ("the business says it never saw my
 * request", "the customer says they were cancelled on"), and seeing how much
 * booking is actually used, which the line at the top and the counts on the
 * status buttons answer.
 *
 * Built like /admin/leads: filters in the URL so a filtered view is a link, the
 * download carries the same filter, and the reads are audit-logged server-side.
 *
 * What is not here, on purpose: the customer's note and any reason a customer
 * typed for cancelling. They can contain health details, so the API never sends
 * them to an admin and this page has no column for them.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Download } from "lucide-react";

import AdminNav from "@/components/AdminNav";
import SiteFooter from "@/components/ds/SiteFooter";
import { Alert, EmptyState } from "@/components/ds/feedback";
import { Badge, Button } from "@/components/ds/primitives";
import { ApiError, getAdminBookings, getAdminStats } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { formatBookingTime, serviceLabel } from "@/lib/booking-format";
import { formatCount, formatPhone } from "@/lib/format";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { AdminBookingPage, BookingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return { title: tFor(getLocale())("admin.bookings.metaTitle") };
}

const PAGE_SIZE = 50;

const TONES: Record<BookingStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  requested: "warning",
  confirmed: "success",
  declined: "danger",
  cancelled: "neutral",
  expired: "neutral",
  completed: "brand",
  no_show: "danger",
};
const STATUSES = Object.keys(TONES) as BookingStatus[];

function isStatus(value: string | undefined): value is BookingStatus {
  return value !== undefined && value in TONES;
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const t = tFor(locale);
  const statusLabel = (value: BookingStatus): string => t(`booking.status.${value}`);
  await requireAdmin("/admin/bookings");

  const status = isStatus(searchParams.status) ? searchParams.status : undefined;
  const parsedPage = Number(searchParams.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  let data: AdminBookingPage | null = null;
  let error: string | null = null;
  try {
    data = await getAdminBookings({ status, page, page_size: PAGE_SIZE });
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("admin.common.apiUnreachable")
          : cause.message
        : t("admin.bookings.loadError");
  }

  // Counts for the nav badges. Failing here must not cost the page.
  const stats = await getAdminStats().catch(() => null);

  const exportHref = `/api/admin/bookings/export${status ? `?status=${status}` : ""}`;
  const filterHref = (value?: BookingStatus): string =>
    value === undefined ? "/admin/bookings" : `/admin/bookings?status=${value}`;
  const pageHref = (target: number): string =>
    `/admin/bookings?${new URLSearchParams({ ...(status ? { status } : {}), page: String(target) })}`;
  const allCount = data ? STATUSES.reduce((sum, s) => sum + data!.status_counts[s], 0) : null;

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-page-title text-ink">{t("admin.bookings.title")}</h1>
        <p className="mt-1 text-body text-ink-muted">{t("admin.bookings.intro")}</p>

        <AdminNav
          current="bookings"
          pendingListings={stats?.pending_listings}
          pendingVerifications={stats?.pending_verifications}
          className="mt-4"
          locale={locale}
        />

        {data !== null ? (
          <p className="text-body text-ink">
            {t("admin.bookings.usage", {
              taking: formatCount(data.businesses_taking_requests, intl),
              recent: formatCount(data.requests_last_30_days, intl),
            })}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("admin.bookings.filterLabel")}>
            <Button asChild variant={status === undefined ? "primary" : "secondary"} size="sm">
              <Link href={filterHref()}>
                {t("admin.bookings.all")}
                {allCount !== null ? ` (${formatCount(allCount, intl)})` : ""}
              </Link>
            </Button>
            {STATUSES.map((value) => (
              <Button key={value} asChild variant={status === value ? "primary" : "secondary"} size="sm">
                <Link href={filterHref(value)}>
                  {statusLabel(value)}
                  {data !== null ? ` (${formatCount(data.status_counts[value], intl)})` : ""}
                </Link>
              </Button>
            ))}
          </div>

          <Button asChild variant="secondary" size="sm">
            {/* A real navigation, not fetch(): letting the browser handle the
                response is what makes Content-Disposition save a file. */}
            <a href={exportHref} download>
              <Download aria-hidden="true" />
              {t("admin.bookings.exportCsv")}
            </a>
          </Button>
        </div>

        {error !== null ? (
          <Alert locale={locale} tone="error" title={t("admin.bookings.loadErrorTitle")} className="mt-4">
            {error}
          </Alert>
        ) : data === null || data.items.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<CalendarCheck className="size-5" aria-hidden="true" />}
            title={status === undefined ? t("admin.bookings.emptyTitle") : t("admin.bookings.emptyStatusTitle")}
            body={status === undefined ? t("admin.bookings.emptyBody") : t("admin.bookings.emptyStatusBody")}
            action={{ label: t("admin.bookings.clearFilter"), href: "/admin/bookings" }}
          />
        ) : (
          <>
            <p className="mt-4 text-meta text-ink-subtle">
              {t(data.total === 1 ? "admin.bookings.countOne" : "admin.bookings.countMany", {
                count: formatCount(data.total, intl),
              })}
              {status !== undefined
                ? t("admin.bookings.ofStatus", { status: statusLabel(status).toLowerCase() })
                : ""}{" "}
              ·{" "}
              {t("admin.bookings.pageOf", {
                page: formatCount(data.page, intl),
                total: formatCount(data.total_pages, intl),
              })}
            </p>

            <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full border-collapse text-body">
                <caption className="sr-only">{t("admin.bookings.caption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-meta text-ink-muted">
                    <th scope="col" className="px-4 py-2 font-medium">{t("admin.bookings.th.booked")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("admin.bookings.th.listing")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("admin.bookings.th.service")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("admin.bookings.th.customer")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("admin.bookings.th.status")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("admin.bookings.th.when")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((booking) => (
                    <tr key={booking.id} className="border-b border-line align-top last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 tabular text-ink-muted">
                        {formatBookingTime(booking.created_at, booking.timezone, intl)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/business/${booking.business_slug}`}
                          className="rounded-sm text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {booking.business_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink">
                          {serviceLabel(booking.service_name, booking.service_name_fr, locale)}
                        </div>
                        <div className="text-meta text-ink-subtle">
                          {t("booking.form.minutes", { minutes: booking.duration_minutes })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink">{booking.customer_name}</div>
                        {booking.customer_phone !== null ? (
                          <div className="tabular text-ink-muted">{formatPhone(booking.customer_phone)}</div>
                        ) : null}
                        <div className="truncate text-meta text-ink-subtle">{booking.customer_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={TONES[booking.status]}>{statusLabel(booking.status)}</Badge>
                        {booking.status === "cancelled" && booking.cancelled_by !== null ? (
                          <div className="mt-1 text-meta text-ink-subtle">
                            {t(`admin.bookings.cancelledBy.${booking.cancelled_by}`)}
                          </div>
                        ) : null}
                        {booking.cancel_reason ? (
                          <div className="mt-1 max-w-xs text-meta text-ink-muted">{booking.cancel_reason}</div>
                        ) : null}
                        {booking.decline_message ? (
                          <div className="mt-1 max-w-xs text-meta text-ink-muted">{booking.decline_message}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular text-ink-muted">
                        {booking.confirmed_start !== null
                          ? formatBookingTime(booking.confirmed_start, booking.timezone, intl)
                          : t("admin.bookings.notScheduled")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total_pages > 1 ? (
              <nav
                className="mt-4 flex items-center justify-between gap-2"
                aria-label={t("admin.bookings.pagination")}
              >
                <Button asChild={data.page > 1} variant="secondary" size="sm" disabled={data.page <= 1}>
                  {data.page > 1 ? (
                    <Link href={pageHref(data.page - 1)}>{t("admin.bookings.previous")}</Link>
                  ) : (
                    <span>{t("admin.bookings.previous")}</span>
                  )}
                </Button>
                <Button
                  asChild={data.page < data.total_pages}
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= data.total_pages}
                >
                  {data.page < data.total_pages ? (
                    <Link href={pageHref(data.page + 1)}>{t("admin.bookings.next")}</Link>
                  ) : (
                    <span>{t("admin.bookings.next")}</span>
                  )}
                </Button>
              </nav>
            ) : null}
          </>
        )}

        <p className="mt-6 max-w-prose text-meta text-ink-subtle">{t("admin.bookings.auditNote")}</p>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
