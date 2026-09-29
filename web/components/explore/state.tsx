"use client";

/**
 * The /explore flow's shared state: React Context over a reducer.
 *
 * Mounted by app/explore/layout.tsx, which Next keeps mounted while the
 * visitor moves between /explore and /explore/results - so the selection
 * survives that navigation in memory. It is also written to sessionStorage
 * on every change, which is what brings it back after a reload, or after
 * leaving for a business profile and pressing Back.
 *
 * Where the selection starts, once, on mount:
 *   1. a results URL with filters in it (a shared link) - it says exactly
 *      what to show, so it wins
 *   2. sessionStorage - this tab's earlier choices
 *   3. empty
 *
 * Children must not act on the selection until `hydrated` is true; before
 * that it is the empty default, not the visitor's.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";

import {
  EMPTY_SELECTION,
  fromPageQuery,
  hasSelectionParams,
  normalise,
  type ExploreSelection,
  type Point,
} from "@/lib/explore";

const STORAGE_KEY = "jfy.explore.selection.v1";

type ListField = "categories" | "cities" | "ratings" | "hours" | "prices";

type Action =
  | { type: "replace"; selection: ExploreSelection }
  | { type: "toggle"; field: ListField; value: string }
  | { type: "setList"; field: ListField; values: string[] }
  | { type: "set"; changes: Partial<ExploreSelection> }
  | { type: "near"; point: Point | null }
  | { type: "reset" };

function reducer(state: ExploreSelection, action: Action): ExploreSelection {
  switch (action.type) {
    case "replace":
      return normalise(action.selection);
    case "toggle": {
      const list = state[action.field] as string[];
      const next = list.includes(action.value)
        ? list.filter((v) => v !== action.value)
        : [...list, action.value];
      const changes: Partial<ExploreSelection> = { [action.field]: next };
      // Choosing a named place replaces "near me" - see normalise().
      if (action.field === "cities" && next.length > list.length) changes.near = null;
      return normalise({ ...state, ...changes });
    }
    case "setList":
      return normalise({ ...state, [action.field]: action.values });
    case "set": {
      const changes = { ...action.changes };
      if (changes.postal) changes.near = null;
      return normalise({ ...state, ...changes });
    }
    case "near":
      return normalise({
        ...state,
        near: action.point,
        // Near me and named places are alternatives.
        ...(action.point ? { cities: [], postal: "" } : {}),
        // Leaving near me takes the distance sort with it (normalise).
      });
    case "reset":
      return { ...EMPTY_SELECTION, sort: state.sort === "distance" ? "relevance" : state.sort };
  }
}

function load(): ExploreSelection | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExploreSelection>;
    return normalise({ ...EMPTY_SELECTION, ...parsed });
  } catch {
    return null;
  }
}

function save(selection: ExploreSelection): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Storage full or blocked: the in-memory state still works for this visit.
  }
}

interface ExploreStore {
  selection: ExploreSelection;
  hydrated: boolean;
  toggle: (field: ListField, value: string) => void;
  setList: (field: ListField, values: string[]) => void;
  set: (changes: Partial<ExploreSelection>) => void;
  setNear: (point: Point | null) => void;
  replace: (selection: ExploreSelection) => void;
  reset: () => void;
}

const ExploreContext = createContext<ExploreStore | null>(null);

export function ExploreStateProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [selection, dispatch] = useReducer(reducer, EMPTY_SELECTION);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl =
      window.location.pathname.startsWith("/explore/results") && hasSelectionParams(params)
        ? fromPageQuery(params)
        : null;
    const initial = fromUrl ?? load();
    if (initial) dispatch({ type: "replace", selection: initial });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(selection);
  }, [hydrated, selection]);

  const toggle = useCallback((field: ListField, value: string) => dispatch({ type: "toggle", field, value }), []);
  const setList = useCallback((field: ListField, values: string[]) => dispatch({ type: "setList", field, values }), []);
  const set = useCallback((changes: Partial<ExploreSelection>) => dispatch({ type: "set", changes }), []);
  const setNear = useCallback((point: Point | null) => dispatch({ type: "near", point }), []);
  const replace = useCallback((next: ExploreSelection) => dispatch({ type: "replace", selection: next }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const value = useMemo<ExploreStore>(
    () => ({ selection, hydrated, toggle, setList, set, setNear, replace, reset }),
    [selection, hydrated, toggle, setList, set, setNear, replace, reset],
  );

  return <ExploreContext.Provider value={value}>{children}</ExploreContext.Provider>;
}

export function useExplore(): ExploreStore {
  const store = useContext(ExploreContext);
  if (store === null) throw new Error("useExplore() must be used inside ExploreStateProvider");
  return store;
}
