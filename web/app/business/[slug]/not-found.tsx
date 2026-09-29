/**
 * Rendered when notFound() fires for an unknown slug.
 *
 * Carries the real header and footer rather than a bare wordmark: a dead link
 * is exactly the moment somebody needs the search box and the rest of the
 * site, not a cul-de-sac with two buttons on it.
 */

import Link from "next/link";
import { SearchX } from "lucide-react";

import SiteFooter from "@/components/ds/SiteFooter";
import { Button, Card } from "@/components/ds/primitives";

export default function BusinessNotFound(): JSX.Element {
  return (
    <>
      {/* @ts-expect-error Async Server Component in a sync parent - allowed in
          the App Router, not yet expressible in the type system. */}

      <main className="mx-auto max-w-2xl px-4 py-section sm:px-6">
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-ink-faint">
            <SearchX className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-section-heading text-ink">Listing not found</h1>
          <p className="max-w-prose text-body text-ink-muted">
            No business matches that address. It may have been removed, or the
            link may be mistyped.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/search">Browse all listings</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </Card>
      </main>

      <SiteFooter locale="en" />
    </>
  );
}
