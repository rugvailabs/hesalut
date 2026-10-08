/**
 * Same-origin bridge: what a plan would cost for this listing.
 *
 * The backend prices it (plan plus the GST/HST for the business's province) and
 * refuses with 409 until the business is verified, so nothing here decides
 * who may buy.
 */

import { NextRequest, NextResponse } from "next/server";

import { getBillingOrder } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { businessId: string } },
): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to choose a plan." }, { status: 401 });
  }
  const businessId = Number(params.businessId);
  const planId = Number(req.nextUrl.searchParams.get("plan_id"));
  if (!Number.isInteger(businessId) || businessId <= 0 || !Number.isInteger(planId) || planId <= 0) {
    return NextResponse.json({ detail: "Unknown listing or plan." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getBillingOrder(businessId, planId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
