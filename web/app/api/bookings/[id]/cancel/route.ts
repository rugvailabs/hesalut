/** Same-origin bridge: a customer withdraws a request or cancels a booking. */

import { NextRequest, NextResponse } from "next/server";

import { cancelMyBooking } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to manage your bookings." }, { status: 401 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ detail: "Unknown booking." }, { status: 400 });
  }
  let reason: string | null = null;
  try {
    const body = (await req.json()) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim();
  } catch {
    // No body is fine: the reason is optional.
  }
  try {
    return NextResponse.json(await cancelMyBooking(id, reason));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
