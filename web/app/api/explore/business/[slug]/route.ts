/**
 * Everything the /explore preview modal shows, in one round trip: the listing
 * detail (hours, full description, contact methods) and its three newest
 * reviews with the rating histogram.
 *
 * The reviews are a nice-to-have next to the listing itself, so a failure
 * fetching them degrades to "no excerpt" rather than failing the preview.
 */

import { NextResponse } from "next/server";

import { getBusinessBySlug, getReviewSummary, getReviews } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
): Promise<NextResponse> {
  try {
    const business = await getBusinessBySlug(params.slug);
    if (business === null) {
      return NextResponse.json({ detail: "Listing not found" }, { status: 404 });
    }

    const [reviews, summary] = await Promise.all([
      getReviews(business.id, { limit: 3 }).catch(() => null),
      getReviewSummary(business.id).catch(() => null),
    ]);

    return NextResponse.json({ business, reviews, summary });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
