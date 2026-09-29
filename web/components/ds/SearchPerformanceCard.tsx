/**
 * "How is my listing doing in search?" - for the owner.
 *
 * Impressions (times shown in results), clicks (opened, number revealed, or
 * enquiry started from a result), click-through rate and average position,
 * over the last 30 days. These are the numbers a paid plan is supposed to
 * move, so they are shown as they are, including when they are zero.
 */

import { Card } from "@/components/ds/primitives";
import { formatCount } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { BusinessSearchPerformance } from "@/lib/types";

/** Tiers with a name under dashboard.performance.tiers; others show raw. */
const TIERS = ["annual", "monthly", "basic", "none"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div>
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className="text-section-heading tabular text-ink">{value}</dd>
      {hint ? <dd className="text-meta text-ink-muted">{hint}</dd> : null}
    </div>
  );
}

export default function SearchPerformanceCard({
  performance,
  locale = "en",
}: {
  performance: BusinessSearchPerformance;
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const oneDecimal = new Intl.NumberFormat(intl, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const percent = new Intl.NumberFormat(intl, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const { impressions, clicks, ctr, avg_position, clicks_by_action, impressions_by_tier, days } =
    performance;
  const tiers = Object.entries(impressions_by_tier).filter(([, n]) => (n ?? 0) > 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-card-title text-ink">{t("dashboard.performance.title")}</h2>
        <span className="text-meta text-ink-muted">
          {t("dashboard.performance.lastDays", { days })}
        </span>
      </div>

      {impressions === 0 ? (
        <p className="mt-2 text-body text-ink-muted">
          {t("dashboard.performance.none")}
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label={t("dashboard.performance.shown")}
              value={formatCount(impressions, intl)}
            />
            <Stat
              label={t("dashboard.performance.clicks")}
              value={formatCount(clicks, intl)}
              hint={t("dashboard.performance.clicksHint", {
                views: formatCount(clicks_by_action.view, intl),
                calls: formatCount(clicks_by_action.call, intl),
                enquiries: formatCount(clicks_by_action.enquire, intl),
              })}
            />
            <Stat label={t("dashboard.performance.ctr")} value={percent.format(ctr)} />
            <Stat
              label={t("dashboard.performance.avgPosition")}
              value={avg_position !== null ? oneDecimal.format(avg_position) : "-"}
              hint={t("dashboard.performance.avgPositionHint")}
            />
          </dl>
          {tiers.length > 0 ? (
            <p className="mt-4 text-meta text-ink-muted">
              {t("dashboard.performance.shownAs")}{" "}
              {tiers
                .map(
                  ([tier, n]) =>
                    `${TIERS.includes(tier) ? t(`dashboard.performance.tiers.${tier}`) : tier} ${formatCount(n ?? 0, intl)}×`,
                )
                .join(" · ")}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
