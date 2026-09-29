/**
 * Edit a listing.
 *
 * Ownership is enforced by the backend (403 for somebody else's listing, 404
 * for one that does not exist). This page's job is to turn those into
 * something sensible rather than a crash: both send the owner back to
 * /dashboard with a reason in the query string.
 *
 * The status badge sits beside the title because editing an approved listing
 * is not the same act as editing a pending one - a change here can send it
 * back for review, and the owner should be able to see which case they are in
 * before they start typing.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import BusinessForm from "@/components/BusinessForm";
import DashboardNav from "@/components/ds/DashboardNav";
import SiteFooter from "@/components/ds/SiteFooter";
import { Button } from "@/components/ds/primitives";
import { ListingStatusBadge } from "@/components/ds/status";
import { ApiError, getCategories, getMyBusiness } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessDetail } from "@/lib/types";

export const dynamic = "force-dynamic";


export default async function EditListingPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireBusinessOwner(`/dashboard/${params.businessId}/edit`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  try {
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      // Somebody else's listing. Do not leak whether it exists.
      redirect("/dashboard?error=forbidden");
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const categories = await getCategories();

  return (
    <>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="link" size="sm" className="-ml-1 h-auto px-1">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            {t("dashboard.common.yourListings")}
          </Link>
        </Button>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-page-title text-ink">{listing.name}</h1>
          <ListingStatusBadge locale={locale} status={listing.status} showHint />
        </div>

        <DashboardNav
          businessId={businessId}
          current="edit"
          className="mt-4"
          locale={locale}
        />

        <div className="mt-4">
          <BusinessForm
            mode="edit"
            categories={categories}
            listing={listing}
            locale={locale}
          />
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
