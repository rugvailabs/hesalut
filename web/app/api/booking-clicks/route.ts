/**
 * Same-origin bridge for counting "Book online" clicks.
 *
 * The browser cannot POST to the API (no CORS). Fire-and-forget: the visitor
 * is already on their way to the owner's booking page, so the answer is always
 * 204 and a failure is never shown.
 */

import { NextRequest, NextResponse } from "next/server";

import { recordBookingClick } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { business_id?: unknown };
    if (typeof body.business_id === "number" && Number.isInteger(body.business_id)) {
      await recordBookingClick(body.business_id);
    }
  } catch {
    // Malformed body or API error: nothing useful to tell the visitor.
  }
  return new NextResponse(null, { status: 204 });
}
