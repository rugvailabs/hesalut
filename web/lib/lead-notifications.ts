/**
 * New-lead counts for the signed-in owner, for the places that show them: the
 * header bell, the dashboard, and the Leads tab.
 *
 * Wrapped in React's `cache` so every component in one render shares a single
 * request, and swallowing every failure: a notification count is a courtesy, so
 * it must never take a page down with it. Callers treat null as "unknown" and
 * show no badge, which is better than a wrong one.
 */

import { cache } from "react";

import { getLeadNotifications } from "@/lib/api";
import type { LeadNotifications } from "@/lib/types";

export const getNewLeads = cache(async (): Promise<LeadNotifications | null> => {
  try {
    return await getLeadNotifications();
  } catch {
    return null;
  }
});
