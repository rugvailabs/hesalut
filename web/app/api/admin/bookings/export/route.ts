/**
 * Streams the bookings CSV out of FastAPI under our own origin.
 *
 * Same reasoning as the leads export: the JWT lives in an httpOnly cookie this
 * origin owns and the API has no CORS, so the browser asks us, we attach the
 * token server-side, and the file comes back with its Content-Disposition
 * intact so the download names itself. The API refuses anyone who is not an
 * admin and records the export in the audit log; this route adds nothing to
 * that and takes nothing away.
 */

import { NextRequest, NextResponse } from "next/server";

import { API_BASE_URL } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const token = getAccessToken();
  if (token === undefined) {
    return NextResponse.json({ detail: "Sign in as an admin." }, { status: 401 });
  }

  // Only the filters the endpoint accepts; anything else is dropped rather
  // than forwarded into a query string we do not control.
  const incoming = req.nextUrl.searchParams;
  const forward = new URLSearchParams();
  for (const key of ["status", "business_id"]) {
    const value = incoming.get(key);
    if (value) forward.set(key, value);
  }

  const suffix = forward.toString();
  const upstream = await fetch(`${API_BASE_URL}/admin/bookings.csv${suffix ? `?${suffix}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return NextResponse.json({ detail: "Could not build the export." }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/csv; charset=utf-8",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? 'attachment; filename="bookings.csv"',
      "Cache-Control": "no-store",
    },
  });
}
