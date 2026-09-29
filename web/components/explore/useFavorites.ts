"use client";

/**
 * The visitor's saved listings, for the /explore flow.
 *
 * Signed out (no session, per the layout), nothing is fetched and `error` is
 * "signed-out" for the caller to turn into a sign-in prompt. A session that
 * turns out to be stale gets the same answer from its first 401.
 *
 * Toggling is optimistic - the heart fills at once - and rolls back if the
 * server refuses, so a failed save never looks like it worked.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useSignedIn } from "@/components/explore/ExploreProviders";
import type { Favorite } from "@/lib/types";

export type ToggleResult = "saved" | "removed" | "signed-out" | "failed";

export interface FavoritesState {
  ids: ReadonlySet<number>;
  list: Favorite[] | null;
  loading: boolean;
  /** "signed-out", "failed", or null. */
  error: "signed-out" | "failed" | null;
  reload: () => void;
  toggle: (businessId: number) => Promise<ToggleResult>;
}

export function useFavorites(): FavoritesState {
  const signedIn = useSignedIn();
  const [ids, setIds] = useState<ReadonlySet<number>>(new Set());
  const [list, setList] = useState<Favorite[] | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<FavoritesState["error"]>(signedIn ? null : "signed-out");
  // Listing ids with a request in flight, so a double click is one request.
  const pending = useRef(new Set<number>());

  const reload = useCallback(() => {
    if (!signedIn) return;
    setLoading(true);
    setError(null);
    fetch("/api/favorites", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          setError("signed-out");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const rows = (await res.json()) as Favorite[];
        setList(rows);
        setIds(new Set(rows.map((row) => row.business_id)));
      })
      .catch(() => setError("failed"))
      .finally(() => setLoading(false));
  }, [signedIn]);

  useEffect(reload, [reload]);

  const toggle = useCallback(
    async (businessId: number): Promise<ToggleResult> => {
      if (error === "signed-out") return "signed-out";
      if (pending.current.has(businessId)) return "failed";
      pending.current.add(businessId);

      const wasSaved = ids.has(businessId);
      const flip = (saved: boolean) =>
        setIds((current) => {
          const next = new Set(current);
          if (saved) next.add(businessId);
          else next.delete(businessId);
          return next;
        });

      flip(!wasSaved);
      try {
        const res = await fetch(`/api/favorites/${businessId}`, {
          method: wasSaved ? "DELETE" : "PUT",
        });
        if (res.status === 401) {
          flip(wasSaved);
          setError("signed-out");
          return "signed-out";
        }
        if (!res.ok) throw new Error(String(res.status));
        if (wasSaved) {
          setList((current) => current?.filter((row) => row.business_id !== businessId) ?? null);
        } else {
          // The saved list needs the listing's fields; fetch it fresh next
          // time it is shown rather than reconstructing a row here.
          setList(null);
        }
        return wasSaved ? "removed" : "saved";
      } catch {
        flip(wasSaved);
        return "failed";
      } finally {
        pending.current.delete(businessId);
      }
    },
    [error, ids],
  );

  return { ids, list, loading, error, reload, toggle };
}
