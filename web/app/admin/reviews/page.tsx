/**
 * Review moderation: every review on the site, searchable, with delete.
 *
 * The search term lives in the query string so a particular view is linkable
 * and survives the router.refresh() that follows a delete.
 */

import Link from "next/link";

import AdminReviewList from "@/components/AdminReviewList";
import AdminNav from "@/components/AdminNav";
import Alert from "@/components/ui/Alert";
import { FIELD } from "@/components/ui/field";
import Button from "@/components/ui/Button";
import { ApiError, getAllReviews } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { AdminReviewItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireAdmin("/admin/reviews");

  const q = (searchParams.q ?? "").trim();

  let reviews: AdminReviewItem[] = [];
  let error: string | null = null;
  try {
    reviews = await getAllReviews({ q: q || undefined, limit: 100 });
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? t("admin.common.apiUnreachable")
          : cause.message
        : t("admin.reviews.loadError");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {t("admin.reviews.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">{t("admin.reviews.intro")}</p>

      <div className="mt-5">
        <AdminNav current="reviews" locale={locale} />
      </div>

      {/* A plain GET form: no client JS needed, and the result is a real URL. */}
      <form method="get" className="mt-5 flex flex-wrap gap-2" role="search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("admin.reviews.searchLabel")}</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("admin.reviews.searchPlaceholder")}
            className={FIELD}
          />
        </label>
        <Button type="submit">{t("admin.reviews.search")}</Button>
        {q ? (
          <Link
            href="/admin/reviews"
            className="inline-flex items-center rounded-md px-3 py-2 text-sm text-slate-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {t("admin.reviews.clear")}
          </Link>
        ) : null}
      </form>

      <p className="mt-4 mb-3 text-sm text-slate-600">
        {t(reviews.length === 1 ? "admin.reviews.countOne" : "admin.reviews.countMany", {
          count: reviews.length.toLocaleString(INTL_LOCALE[locale]),
        })}
        {q ? t("admin.reviews.matching", { q }) : ""}
      </p>

      {error !== null ? (
        <Alert locale={locale} tone="error" title={t("admin.reviews.loadErrorTitle")}>
          {error}
        </Alert>
      ) : (
        <AdminReviewList key={q} reviews={reviews} locale={locale} />
      )}
    </div>
  );
}
