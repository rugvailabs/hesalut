/**
 * Same-origin bridge: the owner has looked at this listing's leads.
 *
 * The backend refuses a listing the caller does not own, so nothing here decides
 * who may clear whose count.
 */

import { NextRequest, NextResponse } from "next/server";

import { markLeadsSeen } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { businessId: string } },
): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to continue." }, { status: 401 });
  }
  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) {
    return NextResponse.json({ detail: "Unknown listing." }, { status: 400 });
  }

  try {
    return NextResponse.json(await markLeadsSeen(businessId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
