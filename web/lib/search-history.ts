/**
 * Recent and saved searches, kept in this browser (localStorage).
 *
 *   recent  the last few searches that were run, newest first, deduplicated -
 *           written automatically when results load
 *   saved   searches the visitor chose to keep, with the star on the results
 *           page
 *
 * An entry is the results page's own query string (lib/explore toPageQuery)
 * plus a readable label, so replaying one is just opening that URL. Nothing
 * here leaves the device; there is no account-side copy yet.
 */

export interface SavedSearch {
  /** The /explore/results query string - also the identity of the search. */
  query: string;
  label: string;
  at: number;
}

const RECENT_KEY = "jfy.search.recent";
const SAVED_KEY = "jfy.search.saved";
const RECENT_MAX = 6;
const SAVED_MAX = 20;

/** Fired on window whenever either list changes, so open UIs can refresh. */
export const HISTORY_EVENT = "jfy:search-history";

function read(key: string): SavedSearch[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (e): e is SavedSearch =>
            typeof e === "object" && e !== null && typeof (e as SavedSearch).query === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function write(key: string, entries: SavedSearch[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: history is a convenience, never an error.
  }
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

export function recentSearches(): SavedSearch[] {
  return read(RECENT_KEY);
}

export function savedSearches(): SavedSearch[] {
  return read(SAVED_KEY);
}

export function recordSearch(query: string, label: string): void {
  if (!query) return;
  // One entry per label too: "Plumbers in Burnaby" sorted two ways is still
  // one search to the person reading the list.
  const rest = read(RECENT_KEY).filter((e) => e.query !== query && e.label !== label);
  write(RECENT_KEY, [{ query, label, at: Date.now() }, ...rest].slice(0, RECENT_MAX));
}

export function clearRecent(): void {
  write(RECENT_KEY, []);
}

export function isSaved(query: string): boolean {
  return read(SAVED_KEY).some((e) => e.query === query);
}

/** Save or unsave; returns whether the search is now saved. */
export function toggleSaved(query: string, label: string): boolean {
  const saved = read(SAVED_KEY);
  if (saved.some((e) => e.query === query)) {
    write(SAVED_KEY, saved.filter((e) => e.query !== query));
    return false;
  }
  write(SAVED_KEY, [{ query, label, at: Date.now() }, ...saved].slice(0, SAVED_MAX));
  return true;
}
