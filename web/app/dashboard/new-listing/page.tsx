/**
 * New listing. Server Component: it fetches the category list, then hands off
 * to the client form.
 *
 * No DashboardNav here - the listing does not exist yet, so there are no
 * sibling surfaces to move between, and tabs pointing at leads and reviews for
 * a listing with neither would be four dead links.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import BusinessForm from "@/components/BusinessForm";
import SiteFooter from "@/components/ds/SiteFooter";
import { Button } from "@/components/ds/primitives";
import { getCategories } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";


export default async function NewListingPage(): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireBusinessOwner("/dashboard/new-listing");
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

        <h1 className="mt-2 text-page-title text-ink">{t("dashboard.newListing.title")}</h1>
        <p className="mt-1 max-w-prose text-body text-ink-muted">
          {t("dashboard.newListing.intro")}
        </p>

        <div className="mt-4">
          <BusinessForm mode="create" categories={categories} locale={locale} />
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
