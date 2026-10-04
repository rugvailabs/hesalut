/**
 * Bookings for one listing: requests waiting for an answer, everything else,
 * and the services that can be booked.
 *
 * Ownership is enforced by the backend (403 for somebody else's listing); the
 * page turns that into a redirect rather than a crash. Reading the list is what
 * settles expired requests on the server, so what shows here is current.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import OwnerBookings from "@/components/booking/OwnerBookings";
import DashboardNav from "@/components/ds/DashboardNav";
import SiteFooter from "@/components/ds/SiteFooter";
import { Button } from "@/components/ds/primitives";
import { ApiError, getMyBusiness, getOwnerBookings, getServices } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BookableService, Booking, BusinessDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireBusinessOwner(`/dashboard/${params.businessId}/bookings`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  let bookings: Booking[];
  let services: BookableService[];
  try {
    // Ownership first: no point loading bookings for a listing that is not theirs.
    listing = await getMyBusiness(businessId);
    [bookings, services] = await Promise.all([getOwnerBookings(businessId), getServices(businessId)]);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) redirect("/dashboard?error=forbidden");
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Button asChild variant="link" size="sm" className="-ml-1 h-auto px-1">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            {t("dashboard.common.yourListings")}
          </Link>
        </Button>

        <h1 className="mt-2 text-page-title text-ink">
          {t("booking.owner.title")} · {listing.name}
        </h1>
        <p className="mt-1 text-body text-ink-muted">{t("booking.owner.intro")}</p>

        <DashboardNav businessId={businessId} current="bookings" className="mt-4" locale={locale} />

        <div className="mt-6">
          <OwnerBookings
            businessId={businessId}
            initialBookings={bookings}
            initialServices={services}
            locale={locale}
          />
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
