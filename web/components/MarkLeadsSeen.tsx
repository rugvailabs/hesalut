"use client";

/**
 * Tells the API the owner has looked at this listing's leads, once the page is
 * on screen, so the badges drop to zero.
 *
 * Done from the browser, after the page has rendered, and not while rendering
 * it: the page needs the old "last seen" time to tag which leads are new, and a
 * request that merely prefetches the page must not count as reading it. The
 * refresh afterwards re-runs the server components so the header bell and the
 * Leads tab pick up the cleared count - the tags on this page stay, because they
 * were decided from what was true when it loaded.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MarkLeadsSeen({
  businessId,
  hasNew,
}: {
  businessId: number;
  /** Nothing to clear means nothing to send. */
  hasNew: boolean;
}): null {
  const router = useRouter();

  useEffect(() => {
    if (!hasNew) return;
    let cancelled = false;
    void fetch(`/api/dashboard/leads/${businessId}/seen`, { method: "POST" })
      .then((res) => {
        if (res.ok && !cancelled) router.refresh();
      })
      .catch(() => {
        // Best effort: the leads are still there next time.
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, hasNew, router]);

  return null;
}
