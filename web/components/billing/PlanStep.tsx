"use client";

/**
 * Choose a plan, on the dashboard's billing page - reached only once the
 * business is verified (the API refuses a plan before that).
 *
 * Three cards, in the order the API gives (Annual, Monthly, Basic): name,
 * badge, price, the first three features, "Learn more" and "Select". Select
 * only marks the card; nothing is saved or charged until the next step, where
 * the order is priced and paid.
 */

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Clock } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { Badge, Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatCad } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/types";

import PlanDetailsModal from "./PlanDetailsModal";
import { isFree, monthlyCost, priceLabel } from "./planDisplay";

export default function PlanStep({
  plans,
  selectedPlanId,
  onSelect,
  onContinue,
  continuing,
  error,
  backHref,
  locale,
}: {
  plans: Plan[];
  /** The plan marked so far, if any. */
  selectedPlanId: number | null;
  onSelect: (plan: Plan) => void;
  /** Called with nothing selected too, so the page can say a plan is needed. */
  onContinue: () => void;
  /** True while the next step is loading. */
  continuing: boolean;
  /** A problem with the choice, from the page that owns the next step. */
  error: string | null;
  backHref: string;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const selected = selectedPlanId;
  const [details, setDetails] = useState<Plan | null>(null);

  if (plans.length === 0) {
    return (
      <Alert tone="warning">{t("register.plan.none")}</Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const active = plan.id === selected;
          const price = priceLabel(plan, locale);
          const top = plan.features.slice(0, 3);
          const more = plan.features.length - top.length;
          return (
            <Card
              key={plan.id}
              aria-label={t(active ? "register.plan.cardLabelSelected" : "register.plan.cardLabel", {
                plan: plan.name,
              })}
              className={cn(
                "flex flex-col gap-4 p-5 transition-shadow",
                active && "border-brand-700 ring-2 ring-brand-700",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-card-title text-ink">{plan.name}</h3>
                {plan.badge ? (
                  <Badge tone={isFree(plan) ? "success" : plan.billing_cycle === "yearly" ? "brand" : "neutral"}>
                    {plan.badge}
                  </Badge>
                ) : null}
              </div>

              <div>
                <span className="text-page-title tabular text-ink">{price.amount}</span>
                <span className="text-body text-ink-muted"> {price.per}</span>
                <p className="text-meta tabular text-ink-muted">
                  {isFree(plan)
                    ? t("register.plan.noCard")
                    : plan.billing_cycle === "yearly"
                      ? t("register.plan.billedYearly", {
                          monthly:
                            formatCad(Math.round(monthlyCost(plan) * 100) / 100, INTL_LOCALE[locale]) ?? "",
                        })
                      : t("register.plan.billedMonthly")}
                </p>
              </div>

              <ul className="space-y-2">
                {top.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2 text-body text-ink">
                    {feature.status === "included" ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    )}
                    <span>
                      {feature.label}
                      {feature.status === "coming_soon" ? (
                        <span className="ml-1 text-meta text-warning">{t("register.plan.comingSoon")}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {more > 0 ? (
                <p className="-mt-2 text-meta text-ink-muted">
                  {t(more === 1 ? "register.plan.moreFeature" : "register.plan.moreFeatures", {
                    count: more,
                  })}
                </p>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setDetails(plan)} className="flex-1">
                  {t("register.plan.learnMore")}
                </Button>
                <Button
                  type="button"
                  onClick={() => onSelect(plan)}
                  disabled={active}
                  aria-pressed={active}
                  className="flex-1"
                >
                  {active ? (
                    <>
                      <Check aria-hidden="true" />
                      {t("register.plan.selected")}
                    </>
                  ) : (
                    t("register.plan.select")
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {error !== null ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" />
            {t("dashboard.billing.backToPlans")}
          </Link>
        </Button>
        <Button size="lg" onClick={onContinue} disabled={continuing}>
          {t("register.plan.continue")}
        </Button>
      </div>

      {details !== null ? (
        <PlanDetailsModal
          plan={details}
          plans={plans}
          selectedPlanId={selected}
          selecting={false}
          locale={locale}
          onSelect={(plan) => {
            onSelect(plan);
            setDetails(null);
          }}
          onClose={() => setDetails(null)}
        />
      ) : null}
    </div>
  );
}
