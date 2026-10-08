/**
 * /business/{slug}/book - ask a business for a booking.
 *
 * Signing in is required, and the visitor comes straight back here afterwards
 * (requireUser's returnTo), the same way saving a favourite works. A business
 * that does not take requests answers 404 from the API; that is shown as a
 * plain "not open here" page rather than an error, since a bookmarked link to
 * a business that has since switched requests off is an ordinary thing.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import BookingRequestForm from "@/components/booking/BookingRequestForm";
import SiteFooter from "@/components/ds/SiteFooter";
import { Breadcrumbs, EmptyState } from "@/components/ds/feedback";
import { ApiError, getBookingInfo, getBusinessBySlug, getProfile } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BookingInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: { slug: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  const business = await getBusinessBySlug(params.slug);
  if (business === null) notFound();

  await requireUser(`/business/${params.slug}/book`);
  const user = await getProfile();

  let info: BookingInfo | null = null;
  try {
    info = await getBookingInfo(business.id);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Breadcrumbs
          className="mb-4"
          locale={locale}
          items={[
            { label: t("business.home"), href: "/" },
            { label: business.name, href: `/business/${business.slug}` },
            { label: t("booking.form.title") },
          ]}
        />
        <h1 className="text-page-title text-ink">{t("booking.form.title")}</h1>
        <p className="mt-1 mb-5 text-body text-ink-muted">{business.name}</p>

        {info === null || info.services.length === 0 ? (
          <EmptyState
            title={t("booking.form.unavailableTitle")}
            body={t("booking.form.unavailableBody")}
            action={{ label: t("booking.form.backToListing"), href: `/business/${business.slug}` }}
          />
        ) : (
          <BookingRequestForm
            info={info}
            businessName={business.name}
            slug={business.slug}
            customer={{ name: user.name, email: user.email, phone: user.phone }}
            locale={locale}
          />
        )}

        <p className="mt-6 text-meta text-ink-subtle">
          <Link href={`/business/${business.slug}`} className="underline underline-offset-4">
            {t("booking.form.backToListing")}
          </Link>
        </p>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
