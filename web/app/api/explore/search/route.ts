/**
 * Same-origin bridge for the /explore flow's searches.
 *
 * The browser cannot reach :8000 (no CORS). Only the parameters the search
 * endpoint takes are forwarded - anything else in the query string is dropped
 * here rather than passed through. The multi-select facets repeat
 * (?city=Burnaby&city=Richmond) and are forwarded as lists. Validation stays
 * with FastAPI, whose 422 message is forwarded as it stands.
 */

import { NextRequest, NextResponse } from "next/server";

import { searchBusinesses } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import type { BusinessSearchParams, BusinessSort } from "@/lib/types";

export const dynamic = "force-dynamic";

const LIST_KEYS = ["category_slug", "city", "rating_band", "hours", "price"] as const;
const TEXT_KEYS = ["q", "postal_code", "sort"] as const;
const NUMBER_KEYS = ["lat", "lng", "radius_km", "min_rating", "page", "page_size"] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const incoming = req.nextUrl.searchParams;
  const params: BusinessSearchParams = {};

  for (const key of LIST_KEYS) {
    const values = incoming.getAll(key).map((v) => v.trim()).filter(Boolean);
    if (values.length > 0) params[key] = values;
  }
  for (const key of TEXT_KEYS) {
    const value = incoming.get(key)?.trim();
    if (!value) continue;
    if (key === "sort") params.sort = value as BusinessSort;
    else params[key] = value;
  }
  for (const key of NUMBER_KEYS) {
    const raw = incoming.get(key);
    if (raw === null || raw.trim() === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return NextResponse.json({ detail: `${key} must be a number.` }, { status: 400 });
    }
    params[key] = value;
  }
  if (incoming.get("bookable") === "true") params.bookable = true;
  // Live counts and typeahead are not results anybody chose to see.
  if (incoming.get("track") === "false") params.track = false;

  try {
    return NextResponse.json(await searchBusinesses(params));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
