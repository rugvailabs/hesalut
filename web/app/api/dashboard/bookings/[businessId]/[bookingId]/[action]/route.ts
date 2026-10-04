/**
 * Same-origin bridge for an owner's actions on a booking: accept, decline,
 * cancel, complete, no-show. The action is checked against a fixed list here
 * so it can never be used to reach another API path; ownership is enforced by
 * the backend (403 for somebody else's listing).
 */

import { NextRequest, NextResponse } from "next/server";

import { actOnBooking } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";
import type { BookingAction } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<BookingAction>(["accept", "decline", "cancel", "complete", "no-show"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { businessId: string; bookingId: string; action: string } },
): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to manage bookings." }, { status: 401 });
  }
  const businessId = Number(params.businessId);
  const bookingId = Number(params.bookingId);
  const action = params.action as BookingAction;
  if (
    !Number.isInteger(businessId) || businessId < 1 ||
    !Number.isInteger(bookingId) || bookingId < 1 ||
    !ACTIONS.has(action)
  ) {
    return NextResponse.json({ detail: "Unknown booking action." }, { status: 400 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // complete and no-show carry no body.
  }
  try {
    return NextResponse.json(await actOnBooking(businessId, bookingId, action, body));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
