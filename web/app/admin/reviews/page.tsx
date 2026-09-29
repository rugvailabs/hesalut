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
import type { AdminReviewItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}): Promise<JSX.Element> {
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
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load reviews.";
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Review moderation
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Owners can reply to reviews but not remove them. Deleting one here
        recalculates that listing&apos;s rating.
      </p>

      <div className="mt-5">
        <AdminNav current="reviews" />
      </div>

      {/* A plain GET form: no client JS needed, and the result is a real URL. */}
      <form method="get" className="mt-5 flex flex-wrap gap-2" role="search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search reviews</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Business, reviewer name or email, review text…"
            className={FIELD}
          />
        </label>
        <Button type="submit">Search</Button>
        {q ? (
          <Link
            href="/admin/reviews"
            className="inline-flex items-center rounded-md px-3 py-2 text-sm text-slate-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="mt-4 mb-3 text-sm text-slate-600">
        {reviews.length.toLocaleString("en-CA")}{" "}
        {reviews.length === 1 ? "review" : "reviews"}
        {q ? ` matching “${q}”` : ""}
      </p>

      {error !== null ? (
        <Alert tone="error" title="Could not load reviews">
          {error}
        </Alert>
      ) : (
        <AdminReviewList key={q} reviews={reviews} />
      )}
    </div>
  );
}
