/** Same-origin bridge: list and add the services a listing offers. */

import { NextRequest, NextResponse } from "next/server";

import { createService, getServices } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";
import type { ServiceInput } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: { businessId: string } };

function idOf({ params }: Context): number | null {
  const id = Number(params.businessId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function refusal(id: number | null): NextResponse | null {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to manage services." }, { status: 401 });
  }
  return id === null ? NextResponse.json({ detail: "Unknown listing." }, { status: 400 }) : null;
}

export async function GET(_req: NextRequest, context: Context): Promise<NextResponse> {
  const id = idOf(context);
  const refused = refusal(id);
  if (refused || id === null) return refused as NextResponse;
  try {
    return NextResponse.json(await getServices(id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: NextRequest, context: Context): Promise<NextResponse> {
  const id = idOf(context);
  const refused = refusal(id);
  if (refused || id === null) return refused as NextResponse;
  let body: ServiceInput;
  try {
    body = (await req.json()) as ServiceInput;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }
  try {
    return NextResponse.json(await createService(id, body), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
