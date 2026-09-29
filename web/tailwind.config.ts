import type { Config } from "tailwindcss";

/**
 * Tailwind maps the CSS variables in globals.css onto utility classes.
 *
 * Nothing here defines a colour - it only names the tokens, so a change to a
 * token is a one-line change in one file and every component follows. The
 * `<alpha-value>` placeholders are what let "bg-brand/10" work against a
 * variable.
 */

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          muted: "hsl(var(--surface-muted) / <alpha-value>)",
        },
        line: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)",
          strong: "hsl(var(--border-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "hsl(var(--ink) / <alpha-value>)",
          muted: "hsl(var(--ink-muted) / <alpha-value>)",
          subtle: "hsl(var(--ink-subtle) / <alpha-value>)",
          faint: "hsl(var(--ink-faint) / <alpha-value>)",
          inverse: "hsl(var(--ink-inverse) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "hsl(var(--brand-600) / <alpha-value>)",
          50: "hsl(var(--brand-50) / <alpha-value>)",
          100: "hsl(var(--brand-100) / <alpha-value>)",
          200: "hsl(var(--brand-200) / <alpha-value>)",
          300: "hsl(var(--brand-300) / <alpha-value>)",
          400: "hsl(var(--brand-400) / <alpha-value>)",
          500: "hsl(var(--brand-500) / <alpha-value>)",
          600: "hsl(var(--brand-600) / <alpha-value>)",
          700: "hsl(var(--brand-700) / <alpha-value>)",
          800: "hsl(var(--brand-800) / <alpha-value>)",
          900: "hsl(var(--brand-900) / <alpha-value>)",
          950: "hsl(var(--brand-950) / <alpha-value>)",
        },
        rating: {
          DEFAULT: "hsl(var(--rating) / <alpha-value>)",
          ink: "hsl(var(--rating-ink) / <alpha-value>)",
        },
        open: {
          DEFAULT: "hsl(var(--open) / <alpha-value>)",
          bg: "hsl(var(--open-bg) / <alpha-value>)",
        },
        closed: {
          DEFAULT: "hsl(var(--closed) / <alpha-value>)",
          bg: "hsl(var(--closed-bg) / <alpha-value>)",
        },
        sponsored: {
          DEFAULT: "hsl(var(--sponsored) / <alpha-value>)",
          bg: "hsl(var(--sponsored-bg) / <alpha-value>)",
        },
        promoted: {
          DEFAULT: "hsl(var(--promoted) / <alpha-value>)",
          bg: "hsl(var(--promoted-bg) / <alpha-value>)",
        },
        verified: {
          DEFAULT: "hsl(var(--verified) / <alpha-value>)",
          bg: "hsl(var(--verified-bg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          bg: "hsl(var(--danger-bg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          bg: "hsl(var(--warning-bg) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          bg: "hsl(var(--success-bg) / <alpha-value>)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
      },
      fontFamily: {
        // Set by next/font in app/layout.tsx; the stack is the fallback while
        // the file loads and on the rare machine that blocks it.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        // The type scale, named by role. A component asks for "card-title",
        // not "text-base", so a change to the scale does not mean auditing
        // every use of a size.
        "page-title": ["1.875rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        "section-heading": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "card-title": ["1rem", { lineHeight: "1.375rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.25rem" }],
        meta: ["0.8125rem", { lineHeight: "1.125rem" }],
        micro: [
          "0.6875rem",
          { lineHeight: "1rem", letterSpacing: "0.06em", fontWeight: "600" },
        ],
      },
      borderRadius: {
        card: "var(--radius-card)",
        input: "var(--radius-input)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        // Two levels, both faint. Structure comes from borders; shadow is
        // reserved for things that genuinely float above the page.
        raised: "0 1px 2px 0 hsl(var(--ink) / 0.05)",
        overlay:
          "0 4px 6px -1px hsl(var(--ink) / 0.08), 0 2px 4px -2px hsl(var(--ink) / 0.06)",
      },
      spacing: {
        // 4px base. Named steps exist only where a raw number would be
        // ambiguous at a glance.
        gutter: "1rem",
        section: "3rem",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Small and quick: a menu, a toast or a new card settling in, never
        // a flourish. Used with motion-safe: so reduced-motion users get none.
        "menu-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "menu-in": "menu-in 120ms ease-out",
        "rise-in": "rise-in 200ms ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
