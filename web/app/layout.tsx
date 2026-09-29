/**
 * Root layout: fonts, the page ground, and the theme (lib/theme.ts).
 *
 * Inter through next/font, which self-hosts the file and emits it as a CSS
 * variable - no network request to Google on first paint, and no layout shift
 * when it lands. tailwind.config.ts reads that variable, so `font-sans` is
 * Inter everywhere without a single component naming the typeface.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { indexingAllowed } from "@/lib/indexing";
import { THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "justforyou",
  description: "Find local businesses across Canada.",
  // Test deployments are kept out of search engines; see lib/indexing.ts.
  ...(indexingAllowed ? {} : { robots: { index: false, follow: false } }),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    // suppressHydrationWarning: THEME_SCRIPT adds the `dark` class before
    // React hydrates, so <html>'s class legitimately differs from the server's.
    <html lang="en-CA" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- a constant, not user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
