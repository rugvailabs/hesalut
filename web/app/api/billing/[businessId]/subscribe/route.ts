/**
 * Same-origin bridge: choose a plan and pay for it (test mode), once the
 * business is verified.
 *
 * The amount is not sent: the backend charges what its own order summary
 * says. The card is forwarded and nothing else is done with it - not logged,
 * not stored, not echoed back.
 */

import { NextRequest, NextResponse } from "next/server";

import { subscribeBilling } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";
import type { BillingSubscribeRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { businessId: string } },
): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to choose a plan." }, { status: 401 });
  }
  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId <= 0) {
    return NextResponse.json({ detail: "Unknown listing." }, { status: 400 });
  }

  let body: Partial<BillingSubscribeRequest>;
  try {
    body = (await req.json()) as Partial<BillingSubscribeRequest>;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const payload: BillingSubscribeRequest = {
    plan_id: Number(body.plan_id),
    accept_terms: body.accept_terms === true,
  };
  if (body.card_number !== undefined) {
    payload.card_number = String(body.card_number);
    payload.exp_month = Number(body.exp_month);
    payload.exp_year = Number(body.exp_year);
    payload.cvc = String(body.cvc ?? "");
    payload.cardholder_name =
      typeof body.cardholder_name === "string" ? body.cardholder_name : null;
  }

  try {
    return NextResponse.json({ state: await subscribeBilling(businessId, payload) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
