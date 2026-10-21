"use client";

/**
 * "Sign in to ..." in place of something only signed-in visitors get: a phone
 * number, the enquiry form. Browsing is public; these are not.
 *
 * Sends the visitor to /login with `next` set to the page they are on, so they
 * come straight back to it. /login checks `next` with safeNext before using it.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ds/primitives";

export default function SignInLink({
  label,
  hash = "",
  icon,
  size = "sm",
  variant = "secondary",
  className,
}: {
  label: string;
  /** Appended to `next`, e.g. "#enquire" to reopen the form on return. */
  hash?: string;
  icon?: React.ReactNode;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost" | "link";
  className?: string;
}): JSX.Element {
  const pathname = usePathname();
  // The query string matters on /explore/results, where it is the search.
  // Read after mount: useSearchParams would force a Suspense boundary on every
  // page that renders a card.
  const [here, setHere] = useState(pathname);
  useEffect(() => setHere(window.location.pathname + window.location.search), [pathname]);

  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={`/login?next=${encodeURIComponent(here + hash)}`}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}
