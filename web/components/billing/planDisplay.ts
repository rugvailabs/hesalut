/**
 * Plan display helpers shared by the plan cards, the details modal and the
 * order summary, so a price or a feature status reads the same everywhere.
 */

import { formatCad } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { Plan, PlanFeature } from "@/lib/types";

export function isFree(plan: Plan): boolean {
  return Number(plan.amount) <= 0;
}

/** "$29.00 / month", "$290.00 / year", "Free" - or "29,00 $ / mois" in French. */
export function priceLabel(plan: Plan, locale: Locale): { amount: string; per: string } {
  const t = tFor(locale);
  if (isFree(plan)) return { amount: t("register.price.free"), per: "" };
  return {
    amount: formatCad(plan.amount, INTL_LOCALE[locale]) ?? plan.amount,
    per: plan.billing_cycle === "yearly" ? t("register.price.perYear") : t("register.price.perMonth"),
  };
}

/** What the plan costs per month - the yearly price spread over twelve. */
export function monthlyCost(plan: Plan): number {
  const amount = Number(plan.amount);
  return plan.billing_cycle === "yearly" ? amount / 12 : amount;
}

const FEATURE_STATUS_KEY: Record<PlanFeature["status"], string> = {
  included: "register.price.included",
  coming_soon: "register.price.comingSoon",
};

/** "Included" / "Coming soon", in the visitor's language. */
export function featureStatusLabel(status: PlanFeature["status"], locale: Locale): string {
  return tFor(locale)(FEATURE_STATUS_KEY[status]);
}

/**
 * Every feature any plan lists, in first-seen order - the rows of the
 * comparison table. A plan that does not list a feature does not have it.
 */
export function allFeatureLabels(plans: Plan[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const plan of plans) {
    for (const feature of plan.features) {
      if (!seen.has(feature.label)) {
        seen.add(feature.label);
        labels.push(feature.label);
      }
    }
  }
  return labels;
}
