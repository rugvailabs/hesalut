"use client";

/**
 * Run a search-bar submission through smart search (lib/understand.ts).
 *
 * Free text goes to the backend first; what comes back is applied as the
 * filters it names, and the store's `smart` note records what was understood.
 * When nothing was understood - the model is down, or the text is just a name
 * - the words are searched as typed, exactly as before smart search existed.
 * Either way the caller gets the selection to apply and whether to run the
 * "near me" locate flow, and does its own navigation.
 *
 * Typing is never blocked: the request runs in the background, a newer
 * submission aborts an older one, and so does editing the words while it
 * runs (cancelIfEdited).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useExploreT } from "@/components/explore/ExploreProviders";
import type { SearchSubmit } from "@/components/explore/SearchBar";
import { useExplore } from "@/components/explore/state";
import { withSearch, type ExploreSelection } from "@/lib/explore";
import { splitNearMe } from "@/lib/near-me";
import { applyUnderstanding, smartKey, understand } from "@/lib/understand";

type Done = (selection: ExploreSelection, nearMe: boolean) => void;

export function useSmartSearch(known: { categories: string[]; cities: string[] }): {
  /** `base` is what a plain word search builds on. */
  search: (submit: SearchSubmit, base: ExploreSelection, done: Done) => void;
  /** The words searched as typed, ignoring what was understood. */
  exactWords: (text: string, where: string, base: ExploreSelection, done: Done) => void;
  /** Abort a running request - a suggestion was picked instead. */
  cancel: () => void;
  /** Abort a running request when the What words no longer match it. */
  cancelIfEdited: (words: string) => void;
  /** The text being understood right now, or null. */
  pending: string | null;
} {
  const { locale } = useExploreT();
  const { setSmart } = useExplore();
  const [pending, setPending] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const knownRef = useRef(known);
  knownRef.current = known;

  useEffect(() => () => controller.current?.abort(), []);

  const exactWords = useCallback(
    (text: string, where: string, base: ExploreSelection, done: Done) => {
      controller.current?.abort();
      setPending(null);
      setSmart(null);
      const split = splitNearMe(text.trim() || undefined);
      done(withSearch(base, split.query ?? "", where, knownRef.current.cities), split.nearMe);
    },
    [setSmart],
  );

  const search = useCallback(
    (submit: SearchSubmit, base: ExploreSelection, done: Done) => {
      const text = submit.text.trim();
      const plain = () => {
        setSmart(null);
        done(withSearch(base, submit.q, submit.where, knownRef.current.cities), submit.nearMe);
      };
      controller.current?.abort();
      controller.current = null;
      // Nothing to read: no words, or only "near me".
      if (submit.q === "") {
        setPending(null);
        plain();
        return;
      }
      const own = new AbortController();
      controller.current = own;
      setPending(text);
      understand(text, locale, own.signal)
        .then((answer) => {
          if (own.signal.aborted) return;
          const applied = applyUnderstanding(base, answer, submit.where, knownRef.current);
          if (applied === null) {
            plain();
            return;
          }
          setSmart({
            text,
            where: submit.where,
            summary: answer.summary,
            unsupported: answer.unsupported,
            key: smartKey(applied.selection),
          });
          // "near me" typed but missed by the model still counts, unless a
          // named place replaced it.
          const placed = applied.selection.cities.length > 0 || applied.selection.postal !== "";
          done(applied.selection, applied.nearMe || (submit.nearMe && !placed));
        })
        .catch(() => {
          // Aborted: a newer search or an edit took over.
        })
        .finally(() => {
          if (controller.current === own) {
            controller.current = null;
            setPending(null);
          }
        });
    },
    [locale, setSmart],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setPending(null);
  }, []);

  const cancelIfEdited = useCallback(
    (words: string) => {
      if (pending !== null && (splitNearMe(pending).query ?? "") !== words) cancel();
    },
    [cancel, pending],
  );

  return { search, exactWords, cancel, cancelIfEdited, pending };
}
