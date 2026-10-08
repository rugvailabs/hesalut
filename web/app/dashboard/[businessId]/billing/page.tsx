/**
 * Plan & billing for one listing.
 *
 * A plan is chosen and paid for only once the business is verified: this page
 * says so in plain words until then, and shows the plan cards after. The API
 * enforces it too (409), so nothing here is the gate - it only explains it.
 *
 * Server Component - it reads the listing, its billing state and the plans with
 * the owner's cookie; the plan and payment steps are the one client part.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import BillingFlow from "@/components/billing/BillingFlow";
import DashboardNav from "@/components/ds/DashboardNav";
import SiteFooter from "@/components/ds/SiteFooter";
import { Alert } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { ApiError, getBilling, getMyBusiness, getPlans } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { formatCad, formatDate } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { BillingState, BusinessDetail, Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

function money(amount: string, currency: string, locale: Locale): string {
  return `${formatCad(amount, INTL_LOCALE[locale]) ?? amount} ${currency}`;
}

export default async function BillingPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const t = tFor(locale);
  await requireBusinessOwner(`/dashboard/${params.businessId}/billing`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  try {
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.isForbidden) redirect("/dashboard?error=forbidden");
    throw error;
  }

  let billing: BillingState | null = null;
  let plans: Plan[] = [];
  let loadError: string | null = null;
  try {
    billing = await getBilling(businessId);
    // Only needed to choose one.
    if (billing.can_subscribe) plans = await getPlans();
  } catch (cause) {
    loadError =
      cause instanceof ApiError && !cause.isNetworkError
        ? cause.message
        : t("dashboard.billing.loadFailed");
  }

  const subscription = billing?.subscription ?? null;
  const receipt = billing?.receipt ?? null;
  const verificationHref = `/dashboard/${businessId}/verification`;

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Button asChild variant="link" size="sm" className="-ml-1 h-auto px-1">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            {t("dashboard.common.yourListings")}
          </Link>
        </Button>

        <h1 className="mt-2 text-page-title text-ink">
          {t("dashboard.billing.title")} · {listing.name}
        </h1>

        <DashboardNav businessId={businessId} current="billing" className="mt-4" locale={locale} />

        {loadError !== null ? (
          <Alert locale={locale} tone="error" className="mt-4">
            {loadError}
          </Alert>
        ) : null}

        {subscription !== null ? (
          <div className="mt-4 space-y-4">
            <Card className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-card-title text-ink">
                <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                {t("dashboard.billing.yourPlan")}
              </h2>
              <dl className="space-y-1.5 text-body">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{t("dashboard.billing.plan")}</dt>
                  <dd className="text-right text-ink">{subscription.plan.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{t("dashboard.billing.status")}</dt>
                  <dd className="text-right text-ink">{t("dashboard.billing.active")}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">
                    {subscription.current_period_end
                      ? t("dashboard.billing.paidUntil")
                      : t("dashboard.billing.validity")}
                  </dt>
                  <dd className="text-right tabular text-ink">
                    {subscription.current_period_end
                      ? t("dashboard.billing.renewsAutomatically", {
                          date: formatDate(subscription.current_period_end, intl),
                        })
                      : t("dashboard.billing.noExpiry")}
                  </dd>
                </div>
              </dl>
            </Card>

            {receipt !== null ? (
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-card-title text-ink">{t("dashboard.billing.receipt")}</h2>
                  <span className="text-meta tabular text-ink-muted">
                    {receipt.receipt_number} · {formatDate(receipt.created_at, intl)}
                  </span>
                </div>
                <dl className="max-w-md space-y-1.5 text-body">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">
                      {t("dashboard.billing.planLine", { plan: subscription.plan.name })}
                    </dt>
                    <dd className="tabular text-ink">{money(receipt.subtotal, receipt.currency, locale)}</dd>
                  </div>
                  {receipt.tax_lines.map((line) => (
                    <div key={line.name} className="flex justify-between gap-4">
                      <dt className="text-ink-muted">
                        {t("dashboard.billing.taxLine", {
                          name: line.name,
                          rate: line.rate,
                          province: receipt.province,
                        })}
                      </dt>
                      <dd className="tabular text-ink">{money(line.amount, receipt.currency, locale)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
                    <dt className="text-ink">{t("dashboard.billing.totalPaid")}</dt>
                    <dd className="tabular text-ink">{money(receipt.total, receipt.currency, locale)}</dd>
                  </div>
                </dl>
                <p className="text-meta text-ink-muted">
                  {t("dashboard.billing.cardEnding", {
                    brand: receipt.card_brand ?? "",
                    last4: receipt.card_last4 ?? "",
                  })}
                  {receipt.gst_hst_registration_number
                    ? t("dashboard.billing.gstNumber", { number: receipt.gst_hst_registration_number })
                    : ""}
                  {receipt.gateway === "stub" ? t("dashboard.billing.testMode") : ""}
                </p>
              </Card>
            ) : null}
          </div>
        ) : billing !== null && billing.can_subscribe ? (
          <div className="mt-4 space-y-4">
            <Alert locale={locale} tone="success" title={t("dashboard.billing.verifiedTitle")}>
              {t("dashboard.billing.verifiedBody")}
            </Alert>
            <BillingFlow
              businessId={businessId}
              plans={plans}
              backHref="/dashboard"
              locale={locale}
            />
          </div>
        ) : billing !== null ? (
          <Alert
            locale={locale}
            tone={billing.verification_status === "rejected" ? "error" : "info"}
            title={
              billing.verification_status === null
                ? t("dashboard.billing.needsDocsTitle")
                : billing.verification_status === "rejected"
                  ? t("dashboard.billing.rejectedTitle")
                  : t("dashboard.billing.pendingTitle")
            }
            className="mt-4"
          >
            <p>
              {billing.verification_status === null
                ? t("dashboard.billing.needsDocsBody")
                : billing.verification_status === "rejected"
                  ? t("dashboard.billing.rejectedBody")
                  : t("dashboard.billing.pendingBody")}
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href={verificationHref}>
                {billing.verification_status === null
                  ? t("dashboard.billing.submitDocs")
                  : t("dashboard.billing.openVerification")}
              </Link>
            </Button>
          </Alert>
        ) : null}
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
