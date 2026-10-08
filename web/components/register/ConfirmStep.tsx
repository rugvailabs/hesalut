"use client";

/**
 * Step 2: confirm the details and accept the terms.
 *
 * Nothing is charged here. A business pays only after it has been verified:
 * registering creates the listing, the owner then submits their documents from
 * the dashboard, and once those are approved they choose a plan on the billing
 * page. The page says so before the button, because an owner who expects a
 * payment step should know why there isn't one.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { PROVINCES } from "@/lib/format";
import { tFor, type Locale } from "@/lib/i18n";
import type { RegistrationState } from "@/lib/types";

export default function ConfirmStep({
  state,
  locale,
}: {
  state: RegistrationState;
  locale: Locale;
}): JSX.Element {
  const router = useRouter();
  const t = tFor(locale);
  const { account, details } = state;
  const provinceName =
    PROVINCES.find((p) => p.code === details?.province)?.[locale] ?? details?.province ?? "";

  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!accepted) {
      setError(t("register.confirm.accept"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept_terms: true }),
      });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("register.confirm.failed", { status: res.status }),
        );
        // 409: already complete - the page knows which step to show.
        if (res.status === 409) router.refresh();
        return;
      }
      router.push("/register?step=3");
      router.refresh();
    } catch {
      setError(t("register.confirm.unreachable"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-card-title text-ink">{t("register.confirm.summaryTitle")}</h2>
          <Link
            href="/register?step=1"
            className="text-meta text-brand-700 underline underline-offset-4"
          >
            {t("register.confirm.changeDetails")}
          </Link>
        </div>
        <dl className="space-y-1.5 text-body">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("register.confirm.account")}</dt>
            <dd className="text-right text-ink">
              {account.name} · {account.email}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("register.confirm.business")}</dt>
            <dd className="text-right text-ink">{details?.business_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">{t("register.confirm.location")}</dt>
            <dd className="text-right text-ink">
              {[details?.address, details?.city, provinceName, details?.postal_code]
                .filter(Boolean)
                .join(", ")}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="flex items-start gap-3 p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
        <div>
          <h2 className="text-card-title text-ink">{t("register.confirm.noChargeTitle")}</h2>
          <p className="mt-1 text-body text-ink-muted">{t("register.confirm.noChargeBody")}</p>
        </div>
      </Card>

      <Card className="p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 size-4 accent-brand-700"
          />
          <span className="text-body text-ink">
            {t("register.payment.agreeBefore")}{" "}
            <Link href="/terms" target="_blank" className="text-brand-700 underline underline-offset-4">
              {t("register.payment.terms")}
            </Link>{" "}
            {t("register.payment.and")}{" "}
            <Link href="/privacy" target="_blank" className="text-brand-700 underline underline-offset-4">
              {t("register.payment.privacy")}
            </Link>
            {t("register.payment.agreeEnd")}
          </span>
        </label>
      </Card>

      {error !== null ? (
        <Alert locale={locale} tone="error">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href="/register?step=1">
            <ArrowLeft aria-hidden="true" />
            {t("register.confirm.back")}
          </Link>
        </Button>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? t("register.confirm.submitting") : t("register.confirm.submit")}
        </Button>
      </div>
    </form>
  );
}
