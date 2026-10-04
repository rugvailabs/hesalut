/**
 * Same-origin bridge for a customer's booking requests.
 *
 * The browser cannot call the API directly (no CORS) and the JWT lives in an
 * httpOnly cookie, so these run server-side. A missing cookie is answered here
 * with a 401 the form can act on; the backend remains the boundary.
 */

import { NextRequest, NextResponse } from "next/server";

import { createBooking } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";
import type { BookingCreate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to request a booking." }, { status: 401 });
  }
  let body: BookingCreate;
  try {
    body = (await req.json()) as BookingCreate;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }
  // Passed on so a retry or double click cannot create two requests.
  const key = req.headers.get("idempotency-key") ?? undefined;
  try {
    return NextResponse.json(await createBooking(body, key), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
