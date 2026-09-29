"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ds/primitives";
import { DEFAULT_LOCALE, tFor, type Locale } from "@/lib/i18n";

/** Clears the session cookies via the session route, then refreshes. */
export default function LogoutButton({
  locale = DEFAULT_LOCALE,
}: {
  /** Optional so a caller that has not threaded the language yet still builds. */
  locale?: Locale;
} = {}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function signOut(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={signOut}
      disabled={busy || isPending}
    >
      {busy || isPending ? t("auth.signingOut") : t("auth.signOut")}
    </Button>
  );
}
