/**
 * /admin/search-analytics - is paid placement working, and is it fair?
 *
 *   By tier            impressions, clicks, CTR and average position per tier
 *   Rotation fairness  how evenly Monthly subscribers share the top three places
 *   Top performers     listings chosen most often, relative to times shown
 *
 * Everything comes from search_impressions: one row per result actually
 * rendered to someone, updated once if they then clicked it.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import AdminNav from "@/components/AdminNav";
import SiteFooter from "@/components/ds/SiteFooter";
import { EmptyState } from "@/components/ds/feedback";
import { Card } from "@/components/ds/primitives";
import { getSearchAnalytics } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { SubscriptionTier } from "@/lib/types";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return { title: tFor(getLocale())("admin.analytics.metaTitle") };
}


const RANGES = [7, 30, 90];

/** One decimal, in the reader's convention ("12.3%" / "12,3 %"). */
function pct(value: number, intl: string): string {
  return new Intl.NumberFormat(intl, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function fixed(value: number, digits: number, intl: string): string {
  return new Intl.NumberFormat(intl, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const TH = "px-3 py-2 text-left text-meta font-medium text-ink-muted";
const TD = "px-3 py-2 text-body tabular text-ink";

export default async function SearchAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const intl = INTL_LOCALE[locale];
  const t = tFor(locale);
  const tierName = (tier: SubscriptionTier): string => t(`admin.analytics.tiers.${tier}`);
  await requireAdmin("/admin/search-analytics");
  const requested = Number(searchParams.days);
  const days = RANGES.includes(requested) ? requested : 30;
  const report = await getSearchAnalytics(days);
  const totalImpressions = report.tiers.reduce((sum, t) => sum + t.impressions, 0);

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-page-title text-ink">{t("admin.analytics.title")}</h1>
        <p className="mt-1 text-body text-ink-muted">{t("admin.analytics.intro")}</p>
        <AdminNav current="search" className="mt-4" locale={locale} />

        <nav aria-label={t("admin.analytics.period")} className="mb-5 flex gap-2">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/admin/search-analytics?days=${range}`}
              aria-current={range === days ? "page" : undefined}
              className={cn(
                "rounded-pill px-3 py-1 text-meta font-medium",
                range === days
                  ? "bg-brand-700 text-ink-inverse"
                  : "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              {t("admin.analytics.lastDays", { days: range })}
            </Link>
          ))}
        </nav>

        {totalImpressions === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-5" aria-hidden="true" />}
            title={t("admin.analytics.emptyTitle")}
            body={t("admin.analytics.emptyBody")}
          />
        ) : (
          <div className="space-y-6">
            <Card className="overflow-x-auto">
              <h2 className="px-4 pt-4 text-card-title text-ink">{t("admin.analytics.byTier")}</h2>
              <table className="mt-2 w-full min-w-[36rem] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className={TH}>{t("admin.analytics.th.tier")}</th>
                    <th className={TH}>{t("admin.analytics.th.impressions")}</th>
                    <th className={TH}>{t("admin.analytics.th.clicks")}</th>
                    <th className={TH}>{t("admin.analytics.th.ctr")}</th>
                    <th className={TH}>{t("admin.analytics.th.avgPosition")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tiers.map((tier) => (
                    <tr key={tier.tier} className="border-b border-line last:border-0">
                      <td className={cn(TD, "font-medium")}>{tierName(tier.tier)}</td>
                      <td className={TD}>{formatCount(tier.impressions, intl)}</td>
                      <td className={TD}>{formatCount(tier.clicks, intl)}</td>
                      <td className={TD}>{pct(tier.ctr, intl)}</td>
                      <td className={TD}>{fixed(tier.avg_position, 1, intl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
                <h2 className="text-card-title text-ink">
                  {t("admin.analytics.rotationTitle")}
                </h2>
                <p className="text-meta text-ink-muted">
                  {report.rotation.fairness === null
                    ? t("admin.analytics.fairnessNone")
                    : t("admin.analytics.fairness", {
                        score: fixed(report.rotation.fairness, 2, intl),
                        count: formatCount(report.rotation.compared, intl),
                        even: fixed(1, 2, intl),
                      })}
                </p>
              </div>
              {report.rotation.subscribers.length === 0 ? (
                <p className="px-4 pb-4 pt-2 text-body text-ink-muted">
                  {t("admin.analytics.noSubscribers")}
                </p>
              ) : (
                <table className="mt-2 w-full min-w-[40rem] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={TH}>{t("admin.analytics.th.business")}</th>
                      <th className={TH}>{t("admin.analytics.th.impressions")}</th>
                      <th className={TH}>{t("admin.analytics.th.topThree")}</th>
                      <th className={TH}>{t("admin.analytics.th.share")}</th>
                      <th className={TH}>{t("admin.analytics.th.ctr")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rotation.subscribers.map((s) => (
                      <tr key={s.business_id} className="border-b border-line last:border-0">
                        <td className={cn(TD, "font-medium")}>{s.name}</td>
                        <td className={TD}>{formatCount(s.impressions, intl)}</td>
                        <td className={TD}>{formatCount(s.leader_impressions, intl)}</td>
                        <td className={TD}>{pct(s.leader_share, intl)}</td>
                        <td className={TD}>{pct(s.ctr, intl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="overflow-x-auto">
              <h2 className="px-4 pt-4 text-card-title text-ink">{t("admin.analytics.topTitle")}</h2>
              <p className="px-4 text-meta text-ink-muted">
                {t("admin.analytics.topIntro")}
              </p>
              {report.top_performers.length === 0 ? (
                <p className="px-4 pb-4 pt-2 text-body text-ink-muted">
                  {t("admin.analytics.noTop")}
                </p>
              ) : (
                <table className="mt-2 w-full min-w-[36rem] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={TH}>{t("admin.analytics.th.business")}</th>
                      <th className={TH}>{t("admin.analytics.th.tier")}</th>
                      <th className={TH}>{t("admin.analytics.th.impressions")}</th>
                      <th className={TH}>{t("admin.analytics.th.clicks")}</th>
                      <th className={TH}>{t("admin.analytics.th.ctr")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_performers.map((p) => (
                      <tr key={p.business_id} className="border-b border-line last:border-0">
                        <td className={cn(TD, "font-medium")}>{p.name}</td>
                        <td className={TD}>{tierName(p.tier)}</td>
                        <td className={TD}>{formatCount(p.impressions, intl)}</td>
                        <td className={TD}>{formatCount(p.clicks, intl)}</td>
                        <td className={TD}>{pct(p.ctr, intl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
