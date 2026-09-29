/**
 * Save (PUT) or unsave (DELETE) one listing. Both are idempotent upstream, so
 * a double click or a retry after a flaky network cannot leave it wrong.
 */

import { NextResponse } from "next/server";

import { removeFavorite, saveFavorite } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Context = { params: { businessId: string } };

async function handle(
  { params }: Context,
  action: (businessId: number) => Promise<void>,
): Promise<NextResponse> {
  if (getAccessToken() === undefined) {
    return NextResponse.json({ detail: "Sign in to save listings." }, { status: 401 });
  }
  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) {
    return NextResponse.json({ detail: "Unknown listing." }, { status: 400 });
  }
  try {
    await action(businessId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export function PUT(_req: Request, context: Context): Promise<NextResponse> {
  return handle(context, saveFavorite);
}

export function DELETE(_req: Request, context: Context): Promise<NextResponse> {
  return handle(context, removeFavorite);
}
