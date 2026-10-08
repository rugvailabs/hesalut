/**
 * Business registration, step 2: accept the terms, which creates the listing.
 * Nothing is charged - a plan is chosen and paid for after verification. The
 * backend refuses without the terms.
 */

import { NextRequest, NextResponse } from "next/server";

import { completeRegistration } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { accept_terms?: unknown } | null;

  try {
    const state = await completeRegistration(body?.accept_terms === true);
    return NextResponse.json({ state }, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
