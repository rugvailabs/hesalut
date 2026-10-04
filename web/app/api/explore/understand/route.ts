/**
 * Same-origin bridge for smart search: free search text read as filters by
 * the backend (GET /api/v1/search/understand).
 *
 * It never fails: a slow, unreachable or broken backend becomes the same
 * answer the backend gives when its model is down - `source: "keywords"`,
 * search the text as typed - so the page always has something to do. The
 * model can take a few seconds; past TIMEOUT_MS the words are searched
 * instead.
 */

import { NextRequest, NextResponse } from "next/server";

import { understandSearch } from "@/lib/api";
import { UNDERSTAND_MAX_LENGTH, keywordsOnly, sanitiseUnderstanding } from "@/lib/understand";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, UNDERSTAND_MAX_LENGTH);
  const lang = req.nextUrl.searchParams.get("lang") === "fr" ? "fr" : "en";
  if (q === "") return NextResponse.json(keywordsOnly(q));

  try {
    const answer = await understandSearch(q, lang, AbortSignal.timeout(TIMEOUT_MS));
    return NextResponse.json(sanitiseUnderstanding(answer, q));
  } catch {
    return NextResponse.json(keywordsOnly(q));
  }
}
