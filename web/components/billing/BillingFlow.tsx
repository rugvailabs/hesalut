"use client";

/**
 * Choose a plan, then pay - the owner's route through billing once their
 * business is verified.
 *
 * Two screens held in state, because nothing is saved between them: the plan
 * cards (mark one), then the priced order and payment. The order comes from the
 * server so the total on screen is the total charged. Paying refreshes the
 * page, which then shows the active plan and the receipt.
 */

import { useState } from "react";

import { tFor, type Locale } from "@/lib/i18n";
import type { OrderSummary, Plan } from "@/lib/types";

import PaymentStep from "./PaymentStep";
import PlanStep from "./PlanStep";

export default function BillingFlow({
  businessId,
  plans,
  backHref,
  locale,
}: {
  businessId: number;
  plans: Plan[];
  backHref: string;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueToPayment(): Promise<void> {
    setError(null);
    if (selectedPlanId === null) {
      setError(t("register.plan.required"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/${businessId}/order?plan_id=${selectedPlanId}`);
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("dashboard.billing.orderFailed", { status: res.status }),
        );
        return;
      }
      setOrder(payload as OrderSummary);
    } catch {
      setError(t("register.plan.unreachable"));
    } finally {
      setLoading(false);
    }
  }

  if (order !== null) {
    return (
      <PaymentStep
        businessId={businessId}
        order={order}
        onBack={() => setOrder(null)}
        locale={locale}
      />
    );
  }

  return (
    <PlanStep
      plans={plans}
      selectedPlanId={selectedPlanId}
      onSelect={(plan) => {
        setSelectedPlanId(plan.id);
        setError(null);
      }}
      onContinue={() => void continueToPayment()}
      continuing={loading}
      error={error}
      backHref={backHref}
      locale={locale}
    />
  );
}
