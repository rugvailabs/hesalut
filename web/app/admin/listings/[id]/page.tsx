/**
 * Full detail of one listing, for reviewing before a decision.
 *
 * The point of this page is that approving from a table row is approving
 * blind: the description, the contact details and the map are what a
 * moderator needs to judge whether a listing is real.
 *
 * Reachable because require_owned_business admits an admin to listings they
 * do not own.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import MapEmbed from "@/components/MapEmbed";
import ModerationQueue from "@/components/ModerationQueue";
import StatusBadge from "@/components/StatusBadge";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import { ApiError, getMyBusiness } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { tFor, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BusinessDetail, ModerationQueueItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The opening_hours keys we have a translated name for; anything else shows raw. */
const DAY_KEYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/** Reshape the detail for the shared action buttons. */
function toQueueItem(
  listing: BusinessDetail,
  uncategorised: string,
): ModerationQueueItem {
  return {
    id: listing.id,
    name: listing.name,
    slug: listing.slug,
    status: listing.status,
    city: listing.city,
    province: listing.province,
    address: listing.address,
    description: listing.description,
    phone: listing.phone,
    website: listing.website,
    category_name: listing.category_name ?? uncategorised,
    owner_id: listing.owner_id,
    owner_email: null,
    moderation_note: listing.moderation_note,
    moderated_at: listing.moderated_at,
    created_at: listing.created_at,
  };
}

export default async function AdminListingDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const locale: Locale = getLocale();
  const t = tFor(locale);
  await requireAdmin(`/admin/listings/${params.id}`);

  const businessId = Number(params.id);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  try {
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const hasPoint = listing.latitude !== null && listing.longitude !== null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">

      <Link href="/admin/listings" className="text-sm underline">
        &larr; {t("admin.listing.back")}
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {listing.name}
        </h1>
        <StatusBadge status={listing.status} showHint locale={locale} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {listing.category_name} &middot; {listing.city}, {listing.province}
      </p>
      <div className="mt-2">
        <RatingStars locale={locale} rating={listing.rating} reviewCount={listing.review_count} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card>
            <h2 className="mb-2 font-semibold text-slate-900">
              {t("admin.listing.description")}
            </h2>
            <p className="text-sm text-slate-700">
              {listing.description ?? (
                <span className="text-slate-400">
                  {t("admin.listing.noDescription")}
                </span>
              )}
            </p>
            {listing.tags !== null && listing.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {listing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold text-slate-900">
              {t("admin.listing.location")}
            </h2>
            <address className="not-italic text-sm text-slate-700">
              {listing.address !== null ? <div>{listing.address}</div> : null}
              <div>
                {listing.city}, {listing.province}
                {listing.postal_code !== null ? ` ${listing.postal_code}` : ""}
              </div>
            </address>
            {hasPoint ? (
              <div className="mt-3">
                <MapEmbed locale={locale}
                  latitude={listing.latitude as number}
                  longitude={listing.longitude as number}
                  name={listing.name}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                {t("admin.listing.noCoordinates")}
              </p>
            )}
          </Card>

          {/* The same buttons as the queue, so a decision made here behaves
              identically to one made from the list. */}
          <Card>
            <h2 className="mb-3 font-semibold text-slate-900">
              {t("admin.listing.decision")}
            </h2>
            <ModerationQueue
              items={[toQueueItem(listing, t("admin.listing.uncategorised"))]}
              locale={locale}
            />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("admin.listing.ownerContact")}
            </h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium text-slate-700">{t("admin.listing.owner")}</dt>
                <dd className="text-slate-600">
                  {listing.owner_id !== null
                    ? t("admin.listing.userId", { id: listing.owner_id })
                    : t("admin.listing.noOwner")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">{t("admin.listing.phone")}</dt>
                <dd className="break-words text-slate-600">
                  {listing.phone ?? t("admin.common.notListed")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">{t("admin.listing.whatsapp")}</dt>
                <dd className="break-words text-slate-600">
                  {listing.whatsapp ?? t("admin.common.notListed")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">{t("admin.listing.email")}</dt>
                <dd className="break-words text-slate-600">
                  {listing.email ?? t("admin.common.notListed")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">{t("admin.listing.website")}</dt>
                <dd className="break-all text-slate-600">
                  {listing.website ?? t("admin.common.notListed")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">
                  {t("admin.listing.priceRange")}
                </dt>
                <dd className="text-slate-600">{listing.price_range ?? "-"}</dd>
              </div>
            </dl>
          </Card>

          {listing.opening_hours !== null &&
          Object.keys(listing.opening_hours).length > 0 ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {t("admin.listing.openingHours")}
              </h2>
              <dl className="space-y-1 text-sm">
                {Object.entries(listing.opening_hours).map(([day, ranges]) => (
                  <div key={day} className="flex justify-between gap-2">
                    <dt className="capitalize text-slate-700">
                      {DAY_KEYS.has(day) ? t(`admin.listing.days.${day}`) : day}
                    </dt>
                    <dd className="tabular-nums text-slate-600">
                      {ranges.map((r) => `${r[0]}-${r[1]}`).join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          {/* No photo gallery: there is no business_photos table, so there is
              nothing to show rather than an empty frame. */}
        </aside>
      </div>
    </div>
  );
}
