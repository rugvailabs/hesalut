/** Same-origin bridge: edit or stop offering one service. */

import { NextRequest, NextResponse } from "next/server";

import { deleteService, updateService } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";
import type { ServiceInput } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: { businessId: string; serviceId: string } };

function ids({ params }: Context): [number, number] | null {
  const a = Number(params.businessId);
  const b = Number(params.serviceId);
  return Number.isInteger(a) && a > 0 && Number.isInteger(b) && b > 0 ? [a, b] : null;
}

function refusal(pair: [number, number] | null): NextResponse | null {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to manage services." }, { status: 401 });
  }
  return pair === null ? NextResponse.json({ detail: "Unknown service." }, { status: 400 }) : null;
}

export async function PATCH(req: NextRequest, context: Context): Promise<NextResponse> {
  const pair = ids(context);
  const refused = refusal(pair);
  if (refused || pair === null) return refused as NextResponse;
  let body: Partial<ServiceInput> & { is_active?: boolean };
  try {
    body = (await req.json()) as Partial<ServiceInput> & { is_active?: boolean };
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateService(pair[0], pair[1], body));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: NextRequest, context: Context): Promise<NextResponse> {
  const pair = ids(context);
  const refused = refusal(pair);
  if (refused || pair === null) return refused as NextResponse;
  try {
    await deleteService(pair[0], pair[1]);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
