/**
 * Light / dark theme.
 *
 * The choice is stored in localStorage (`jfy.theme`); with none stored, the
 * operating system's preference decides. The theme is the `dark` class on
 * <html> - tailwind.config.ts uses darkMode: "class" and globals.css swaps
 * every colour token under `.dark`, so components need no dark: variants.
 *
 * THEME_SCRIPT runs inline in <head> before first paint (app/layout.tsx), so
 * a dark-mode visitor never sees a flash of the light page.
 *
 * Site-wide: every page is built on the colour tokens, so the class switches
 * all of it. Components must not hardcode palette colours (bg-white,
 * text-slate-900, ...) - those stay light in dark mode. Use the tokens.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "jfy.theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})();`;

/** The stored choice, or the operating system's preference. */
export function preferredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // fall through to the OS preference
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Blocked storage: the theme still applies for this page.
  }
}
