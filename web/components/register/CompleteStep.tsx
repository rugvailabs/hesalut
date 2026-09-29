/**
 * Step 4: registration complete.
 *
 * By now the account is active, the listing exists (pending review), the
 * subscription is linked to it, and for a paid plan there is a receipt. This
 * says all of that, and what still has to happen, because "registered" is not
 * "live": a listing appears in search only once a moderator has approved it
 * and the business has passed verification.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { ListingStatusBadge } from "@/components/ds/status";
import { Button, Card } from "@/components/ds/primitives";
import { formatCad, formatDate } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { RegistrationState } from "@/lib/types";

function money(amount: string, currency: string, locale: Locale): string {
  return `${formatCad(amount, INTL_LOCALE[locale]) ?? amount} ${currency}`;
}

export default function CompleteStep({
  state,
  locale,
}: {
  state: RegistrationState;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const { business, subscription, receipt, account } = state;

  // An owner from before registration existed: nothing to summarise.
  if (business === null || subscription === null) {
    return (
      <Card className="p-6">
        <h2 className="text-card-title text-ink">{t("register.complete.alreadyTitle")}</h2>
        <p className="mt-1 text-body text-ink-muted">{t("register.complete.alreadyBody")}</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">{t("register.complete.goDashboard")}</Link>
        </Button>
      </Card>
    );
  }

  const { plan } = subscription;
  const free = Number(plan.amount) <= 0;

  return (
    <div className="space-y-5">
      <Card className="flex items-start gap-3 border-success/30 bg-success-bg p-5">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
        <div>
          <h2 className="text-card-title text-ink">{t("register.complete.title")}</h2>
          <p className="mt-1 text-body text-ink-muted">
            {t("register.complete.body", {
              business: business.name,
              plan: plan.name,
              document: receipt ? t("register.complete.receiptDoc") : t("register.complete.confirmationDoc"),
              email: account.email,
            })}
          </p>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="text-card-title text-ink">{t("register.complete.yourPlan")}</h3>
          <dl className="space-y-1.5 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("register.complete.plan")}</dt>
              <dd className="text-right text-ink">{plan.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("register.complete.status")}</dt>
              <dd className="text-right text-ink">{t("register.complete.active")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">
                {free ? t("register.complete.validity") : t("register.complete.paidUntil")}
              </dt>
              <dd className="text-right tabular text-ink">
                {subscription.current_period_end
                  ? t("register.complete.renewsAutomatically", {
                      date: formatDate(subscription.current_period_end, intl),
                    })
                  : t("register.complete.noExpiry")}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="text-card-title text-ink">{t("register.complete.yourListing")}</h3>
          <p className="text-body text-ink">{business.name}</p>
          <ListingStatusBadge locale={locale} status={business.status} showHint />
        </Card>
      </div>

      {receipt ? (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-card-title text-ink">{t("register.complete.receipt")}</h3>
            <span className="text-meta tabular text-ink-muted">
              {receipt.receipt_number} · {formatDate(receipt.created_at, intl)}
            </span>
          </div>
          <dl className="max-w-md space-y-1.5 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("register.complete.planLine", { plan: plan.name })}</dt>
              <dd className="tabular text-ink">{money(receipt.subtotal, receipt.currency, locale)}</dd>
            </div>
            {receipt.tax_lines.map((line) => (
              <div key={line.name} className="flex justify-between gap-4">
                <dt className="text-ink-muted">
                  {t("register.complete.taxLine", {
                    name: line.name,
                    rate: line.rate,
                    province: receipt.province,
                  })}
                </dt>
                <dd className="tabular text-ink">{money(line.amount, receipt.currency, locale)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
              <dt className="text-ink">{t("register.complete.totalPaid")}</dt>
              <dd className="tabular text-ink">{money(receipt.total, receipt.currency, locale)}</dd>
            </div>
          </dl>
          <p className="text-meta text-ink-muted">
            {t("register.complete.cardEnding", {
              brand: receipt.card_brand ?? "",
              last4: receipt.card_last4 ?? "",
            })}
            {receipt.gst_hst_registration_number
              ? t("register.complete.gstNumber", { number: receipt.gst_hst_registration_number })
              : ""}
            {receipt.gateway === "stub" ? t("register.complete.testMode") : ""}
          </p>
        </Card>
      ) : null}

      <Card className="space-y-3 p-5">
        <h3 className="text-card-title text-ink">{t("register.complete.beforeSearch")}</h3>
        <ol className="list-decimal space-y-2 pl-5 text-body text-ink-muted">
          <li>
            <span className="text-ink">{t("register.complete.verifyTitle")}</span>{" "}
            {t("register.complete.verifyBody")}
          </li>
          <li>
            <span className="text-ink">{t("register.complete.reviewTitle")}</span>{" "}
            {t("register.complete.reviewBody")}
          </li>
          <li>
            <span className="text-ink">{t("register.complete.profileTitle")}</span>{" "}
            {t("register.complete.profileBody")}
          </li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href={`/dashboard/${business.id}/verification`}>{t("register.complete.verifyButton")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/dashboard/${business.id}/edit`}>{t("register.complete.profileButton")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">{t("register.complete.goDashboard")}</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
