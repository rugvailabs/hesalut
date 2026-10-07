"use client";

/**
 * The site's top bar, on every page (rendered once by app/layout.tsx).
 * Sticks to the top while the page scrolls.
 *
 *   logo (home) · tabs · EN/FR · dark mode · account · More
 *
 * Both switches work on every page: the language one re-renders the page in
 * the chosen language, and dark mode is site-wide (lib/theme.ts).
 * The search
 * bar sits just under this header on the results page and sticks with it
 * (components/explore/ResultsStep.tsx); the dashboard is the search bar.
 *
 * Tabs:
 *   Home     hidden by default; the "More" menu shows or hides it
 *   Explore  always shown
 *   Browse   always shown
 *
 * The Home tab is hidden with CSS (display: none), not left out of the
 * render, so showing it again is a style change rather than a remount.
 * `isHomeTabVisible` lives here, and this header belongs to the explore
 * layout, which stays mounted between /explore and /explore/results - so the
 * choice holds while the visitor moves between them. A full page load starts
 * hidden again, as asked.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Bookmark, Check, LayoutDashboard, LogOut, MapPin, Moon, MoreVertical, Shield, Store, Sun } from "lucide-react";

import { useExploreT, useLanguage } from "@/components/explore/ExploreProviders";
import { cn } from "@/lib/cn";
import { LOCALES } from "@/lib/i18n";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme";

export interface HeaderUser {
  name: string;
  email: string;
  /** Owners (and admins) get the Dashboard link; customers get "List your business". */
  isOwner: boolean;
  isAdmin: boolean;
}

export default function ExploreHeader({ user }: { user: HeaderUser | null }): JSX.Element {
  const { t } = useExploreT();
  const [lang, setLang] = useLanguage();
  const pathname = usePathname();
  const [isHomeTabVisible, setIsHomeTabVisible] = useState(false);

  const tabs = [
    { key: "home", href: "/", label: t("header.homeTab"), active: pathname === "/", hidden: !isHomeTabVisible },
    { key: "explore", href: "/explore", label: t("header.explore"), active: pathname.startsWith("/explore"), hidden: false },
    { key: "browse", href: "/search", label: t("header.browse"), active: pathname.startsWith("/search"), hidden: false },
  ];

  const signInHref = `/login?next=${encodeURIComponent(pathname)}`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          href="/"
          aria-label={t("header.home")}
          className="flex items-center gap-1.5 rounded-sm text-card-title font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <MapPin className="size-5 text-brand-700" aria-hidden="true" />
          <span className="hidden sm:inline">
            justfor<span className="text-brand-700">you</span>
          </span>
        </Link>

        <nav aria-label={t("header.tabs")} className="min-w-0">
          <ul className="flex items-center gap-0.5 sm:gap-1">
            {tabs.map((tab) => (
              // `hidden` is display: none - the tab stays in the DOM.
              <li key={tab.key} className={cn(tab.hidden && "hidden")}>
                <Link
                  href={tab.href}
                  aria-current={tab.active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-input px-2 py-1.5 text-body transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:px-3",
                    tab.active
                      ? "bg-brand-50 font-medium text-brand-800"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div
            role="group"
            aria-label={t("header.language")}
            className="inline-flex rounded-pill border border-line p-0.5 text-micro"
          >
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                className={cn(
                  "rounded-pill px-2 py-1 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                  lang === code ? "bg-brand-700 text-ink-inverse" : "text-ink-muted hover:text-ink",
                )}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <ThemeToggle />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link
              href={signInHref}
              className="hidden rounded-input border border-line-strong px-3 py-1.5 text-body text-ink transition-colors hover:bg-surface-muted sm:inline-block"
            >
              {t("header.signIn")}
            </Link>
          )}
          <MoreMenu
            isHomeTabVisible={isHomeTabVisible}
            onToggleHome={() => setIsHomeTabVisible((visible) => !visible)}
            signInHref={user ? null : signInHref}
          />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------ theme */

function ThemeToggle(): JSX.Element {
  const { t } = useExploreT();
  // The real theme is only known in the browser (the head script set it);
  // null until mounted keeps the server and first client render identical.
  // It follows <html>'s class rather than reading it once, because the
  // explore providers set and clear that class in effects of their own,
  // which may run after this one.
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label={t("header.darkMode")}
      aria-pressed={theme === null ? undefined : dark}
      title={t("header.darkMode")}
      onClick={() => {
        const next: Theme = dark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
      className="flex size-9 items-center justify-center rounded-input text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------------------------------------ menus */

/**
 * A button that opens a small menu. Closes on Escape (focus back to the
 * button), on a click outside, and after a choice.
 */
function useMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
      // Arrow keys move between the items, as a menu should.
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = Array.from(
          panel.current?.querySelectorAll<HTMLElement>("a, button") ?? [],
        ).filter((item) => item.offsetParent !== null);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (items.length === 0) return;
        event.preventDefault();
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        items[(next + items.length) % items.length].focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return { open, setOpen, close, id, wrapper, button, panel };
}

const ITEM =
  "flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-body text-ink transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none";
const PANEL =
  "absolute right-0 top-full z-50 mt-1 w-60 origin-top-right rounded-card border border-line bg-surface p-1 shadow-overlay motion-safe:animate-menu-in";

function UserMenu({ user }: { user: HeaderUser }): JSX.Element {
  const { t } = useExploreT();
  const router = useRouter();
  const menu = useMenu();
  const [signingOut, setSigningOut] = useState(false);
  const initial = (user.name.trim()[0] ?? user.email[0] ?? "?").toUpperCase();

  return (
    <div ref={menu.wrapper} className="relative">
      <button
        ref={menu.button}
        type="button"
        aria-label={t("header.account")}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.id}
        onClick={() => menu.setOpen((current) => !current)}
        className="flex size-9 items-center justify-center rounded-pill bg-brand-700 text-body font-semibold text-ink-inverse transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {initial}
      </button>
      <div ref={menu.panel} id={menu.id} role="menu" aria-label={t("header.account")} hidden={!menu.open} className={PANEL}>
        <div className="border-b border-line px-3 pb-2 pt-1.5">
          <p className="text-micro uppercase text-ink-subtle">{t("header.signedInAs")}</p>
          <p className="truncate text-body font-medium text-ink">{user.name}</p>
          <p className="truncate text-meta text-ink-muted">{user.email}</p>
        </div>
        <div className="pt-1">
          <Link role="menuitem" href="/explore/results?tab=saved" onClick={() => menu.setOpen(false)} className={ITEM}>
            <Bookmark className="size-4 text-ink-muted" aria-hidden="true" />
            {t("header.savedBusinesses")}
          </Link>
          {user.isOwner ? (
            <Link role="menuitem" href="/dashboard" onClick={() => menu.setOpen(false)} className={ITEM}>
              <LayoutDashboard className="size-4 text-ink-muted" aria-hidden="true" />
              {t("header.dashboard")}
            </Link>
          ) : (
            <Link role="menuitem" href="/register" onClick={() => menu.setOpen(false)} className={ITEM}>
              <Store className="size-4 text-ink-muted" aria-hidden="true" />
              {t("header.listBusiness")}
            </Link>
          )}
          {user.isAdmin ? (
            <Link role="menuitem" href="/admin" onClick={() => menu.setOpen(false)} className={ITEM}>
              <Shield className="size-4 text-ink-muted" aria-hidden="true" />
              {t("header.admin")}
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await fetch("/api/auth/session", { method: "DELETE" });
                router.replace("/explore");
                router.refresh();
              } finally {
                setSigningOut(false);
                menu.setOpen(false);
              }
            }}
            className={ITEM}
          >
            <LogOut className="size-4 text-ink-muted" aria-hidden="true" />
            {signingOut ? t("header.signingOut") : t("header.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The "More" menu. Holds the Home-tab switch, and on phones the sign-in link
 * the header has no room for.
 */
function MoreMenu({
  isHomeTabVisible,
  onToggleHome,
  signInHref,
}: {
  isHomeTabVisible: boolean;
  onToggleHome: () => void;
  signInHref: string | null;
}): JSX.Element {
  const { t } = useExploreT();
  const menu = useMenu();

  return (
    <div ref={menu.wrapper} className="relative">
      <button
        ref={menu.button}
        type="button"
        aria-label={t("header.more")}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.id}
        onClick={() => menu.setOpen((current) => !current)}
        className="flex size-9 items-center justify-center rounded-input text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <MoreVertical className="size-4" aria-hidden="true" />
      </button>
      <div ref={menu.panel} id={menu.id} role="menu" aria-label={t("header.more")} hidden={!menu.open} className={PANEL}>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={isHomeTabVisible}
          onClick={() => {
            onToggleHome();
            menu.close();
          }}
          className={ITEM}
        >
          <span className="flex size-4 items-center justify-center text-brand-700">
            {isHomeTabVisible ? <Check className="size-4" aria-hidden="true" /> : null}
          </span>
          {t("header.showHome")}
        </button>
        {signInHref ? (
          // Plain concatenation: cn() (tailwind-merge) reads the custom
          // text-body size and text-ink colour as one conflict and drops one.
          <Link role="menuitem" href={signInHref} className={`${ITEM} sm:hidden`}>
            <span className="size-4" aria-hidden="true" />
            {t("header.signIn")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
