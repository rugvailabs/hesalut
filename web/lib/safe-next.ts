/**
 * Validation for the `next` parameter on /login.
 *
 * `next` says where to send someone after they sign in. If it can point
 * anywhere, a crafted /login?next=https://evil.example link turns our sign-in
 * page into an open redirect. Only a path on this site is allowed.
 *
 * Pure and dependency-free so middleware (edge runtime), server components and
 * client components can all use it.
 */

const BASE = "http://site.invalid";

/** The path to go to after sign-in, or "" when `raw` is not a path on this site. */
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw === "") return "";

  // Must be a rooted path. "//host" and "/\host" are protocol-relative to a
  // browser, which treats "\" as "/".
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "";

  // Tabs, newlines and other control characters are stripped by URL parsers, so
  // "/\t/evil.example" can become "//evil.example". Backslashes get the same
  // treatment.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "";

  try {
    // Whatever the parser makes of it must still be this site.
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return "";
    // A doubly-encoded "//" would only be a problem if something decoded it
    // again before redirecting, so refuse it as well.
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.startsWith("//") || decoded.includes("\\")) return "";
  } catch {
    return "";
  }

  return raw;
}
