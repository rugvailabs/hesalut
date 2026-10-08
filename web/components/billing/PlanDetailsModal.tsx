"use client";

/**
 * "Learn more" for one plan: the full description, every feature, the
 * benefits, a return-on-investment check and a comparison with the other plans.
 *
 * A native <dialog> opened with showModal(), so focus is trapped, Escape closes
 * it and the page behind is inert without re-implementing any of that. It
 * closes on the X button, on Escape, or when the plan is selected.
 *
 * The ROI section is arithmetic on the owner's own number - how many jobs a
 * month pay for the plan - not a statistic about what listings earn, because
 * there is no data behind any such figure.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Clock, Minus, X } from "lucide-react";

import { Badge, Button, Input, Label } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatCad } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { Plan, PlanFeature } from "@/lib/types";

import {
  allFeatureLabels,
  featureStatusLabel,
  isFree,
  monthlyCost,
  priceLabel,
} from "./planDisplay";

function StatusIcon({ status }: { status: PlanFeature["status"] | null }): JSX.Element {
  if (status === "included") return <Check className="size-4 shrink-0 text-success" aria-hidden="true" />;
  if (status === "coming_soon") return <Clock className="size-4 shrink-0 text-warning" aria-hidden="true" />;
  return <Minus className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />;
}

export default function PlanDetailsModal({
  plan,
  plans,
  selectedPlanId,
  selecting,
  onSelect,
  onClose,
  locale,
}: {
  plan: Plan;
  plans: Plan[];
  selectedPlanId: number | null;
  selecting: boolean;
  onSelect: (plan: Plan) => void;
  onClose: () => void;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const cad = (amount: number): string => formatCad(amount, INTL_LOCALE[locale]) ?? String(amount);
  const dialog = useRef<HTMLDialogElement>(null);
  const [jobValue, setJobValue] = useState("");

  // No cleanup that calls close(): React runs effects twice in development,
  // and closing fires onClose, which would unmount the modal as it opens.
  // Removing the element from the page closes it anyway.
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);

  const price = priceLabel(plan, locale);
  const perMonth = monthlyCost(plan);
  const value = Number(jobValue);
  const jobsNeeded = value > 0 ? Math.ceil(perMonth / value) : null;
  const rows = allFeatureLabels(plans);
  const titleId = `plan-${plan.id}-title`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      // Escape fires `cancel` then `close`; either way the parent unmounts us.
      onClose={onClose}
      className="w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-black/50"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-page-title text-ink">
              {plan.name}
            </h2>
            {plan.badge ? <Badge tone={isFree(plan) ? "success" : "brand"}>{plan.badge}</Badge> : null}
          </div>
          <p className="mt-1 text-body text-ink-muted">
            <span className="text-card-title tabular text-ink">{price.amount}</span> {price.per}
            {plan.billing_cycle === "yearly" && !isFree(plan)
              ? t("register.modal.perMonth", { amount: cad(Math.round(perMonth * 100) / 100) })
              : ""}
            {isFree(plan) ? "" : t("register.modal.plusTax")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={t("register.modal.close")}
          className="rounded-input p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-7 px-6 py-5">
        {plan.details || plan.description ? (
          <section>
            <h3 className="text-card-title text-ink">{t("register.modal.about")}</h3>
            <p className="mt-2 max-w-prose text-body text-ink-muted">{plan.details ?? plan.description}</p>
          </section>
        ) : null}

        <section>
          <h3 className="text-card-title text-ink">
            {t("register.modal.everything", { plan: plan.name })}
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {plan.features.map((feature) => (
              <li key={feature.label} className="flex items-start gap-2 text-body">
                <span className="mt-0.5">
                  <StatusIcon status={feature.status} />
                </span>
                <span>
                  {feature.label}
                  {feature.status === "coming_soon" ? (
                    <span className="ml-1.5 text-meta text-warning">{t("register.modal.comingSoon")}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {plan.benefits.length > 0 ? (
          <section>
            <h3 className="text-card-title text-ink">{t("register.modal.benefits")}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ink-muted">
              {plan.benefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-card bg-surface-muted p-4">
          <h3 className="text-card-title text-ink">{t("register.modal.worthIt")}</h3>
          {isFree(plan) ? (
            <p className="mt-2 text-body text-ink-muted">
              {t("register.modal.freeRoi", { plan: plan.name })}
            </p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-end">
              <div>
                <Label htmlFor={`roi-${plan.id}`}>{t("register.modal.jobValue")}</Label>
                <Input
                  id={`roi-${plan.id}`}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  placeholder={t("register.modal.jobValuePlaceholder")}
                  value={jobValue}
                  onChange={(e) => setJobValue(e.target.value)}
                />
              </div>
              <p className="text-body text-ink-muted" aria-live="polite">
                {jobsNeeded === null ? (
                  <>
                    {t("register.modal.roiBefore", { plan: plan.name })}{" "}
                    <span className="font-medium tabular text-ink">
                      {cad(Math.round(perMonth * 100) / 100)}
                    </span>{" "}
                    {t("register.modal.roiAfter")}
                  </>
                ) : (
                  <>
                    <span className="font-semibold tabular text-ink">
                      {t(jobsNeeded === 1 ? "register.modal.jobsOne" : "register.modal.jobsMany", {
                        count: jobsNeeded,
                      })}
                    </span>{" "}
                    {t(jobsNeeded === 1 ? "register.modal.coversOne" : "register.modal.coversMany", {
                      value: cad(value),
                      cost: cad(Math.round(perMonth * 100) / 100),
                    })}
                  </>
                )}
              </p>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-card-title text-ink">{t("register.modal.compare")}</h3>
          <div className="mt-2 overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[34rem] border-collapse text-left text-body">
              <thead>
                <tr className="bg-surface-muted">
                  <th scope="col" className="px-3 py-2 text-meta font-medium text-ink-muted">
                    {t("register.modal.feature")}
                  </th>
                  {plans.map((p) => (
                    <th
                      key={p.id}
                      scope="col"
                      className={cn(
                        "px-3 py-2 text-meta font-semibold",
                        p.id === plan.id ? "bg-brand-50 text-brand-800" : "text-ink",
                      )}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <th scope="row" className="px-3 py-2 font-normal text-ink-muted">
                    {t("register.modal.price")}
                  </th>
                  {plans.map((p) => {
                    const label = priceLabel(p, locale);
                    return (
                      <td key={p.id} className={cn("px-3 py-2 tabular", p.id === plan.id && "bg-brand-50")}>
                        {label.amount} {label.per}
                      </td>
                    );
                  })}
                </tr>
                {rows.map((label) => (
                  <tr key={label} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 font-normal text-ink-muted">
                      {label}
                    </th>
                    {plans.map((p) => {
                      const status = p.features.find((f) => f.label === label)?.status ?? null;
                      return (
                        <td key={p.id} className={cn("px-3 py-2", p.id === plan.id && "bg-brand-50")}>
                          <span className="flex items-center gap-1.5 text-meta">
                            <StatusIcon status={status} />
                            {status === null
                              ? t("register.modal.notIncluded")
                              : featureStatusLabel(status, locale)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-6 py-4">
        <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
          {t("register.modal.close")}
        </Button>
        {selectedPlanId === plan.id ? (
          <Button type="button" onClick={() => dialog.current?.close()}>
            <Check aria-hidden="true" />
            {t("register.modal.selected")}
          </Button>
        ) : (
          <Button type="button" disabled={selecting} onClick={() => onSelect(plan)}>
            {selecting ? t("register.modal.selecting") : t("register.modal.selectThis")}
          </Button>
        )}
      </div>
    </dialog>
  );
}
