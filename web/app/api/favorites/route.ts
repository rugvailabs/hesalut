/**
 * Same-origin bridge for the signed-in user's saved listings.
 *
 * A missing cookie is answered here with a 401 the dashboard can act on (show
 * "sign in to save"), rather than a round trip to be refused by FastAPI. The
 * backend is still the boundary.
 */

import { NextResponse } from "next/server";

import { getFavorites } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to see saved listings." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getFavorites());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
