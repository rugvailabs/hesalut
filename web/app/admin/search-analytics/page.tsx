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
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import type { SubscriptionTier } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search analytics" };

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];

const TIER_NAMES: Record<SubscriptionTier, string> = {
  annual: "⭐ Featured (Annual)",
  monthly: "📈 Promoted (Monthly)",
  basic: "Basic",
  none: "No plan",
};

const RANGES = [7, 30, 90];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const TH = "px-3 py-2 text-left text-meta font-medium text-ink-muted";
const TD = "px-3 py-2 text-body tabular text-ink";

export default async function SearchAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}): Promise<JSX.Element> {
  await requireAdmin("/admin/search-analytics");
  const requested = Number(searchParams.days);
  const days = RANGES.includes(requested) ? requested : 30;
  const report = await getSearchAnalytics(days);
  const totalImpressions = report.tiers.reduce((sum, t) => sum + t.impressions, 0);

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-page-title text-ink">Search analytics</h1>
        <p className="mt-1 text-body text-ink-muted">
          How paid placement performs in search results.
        </p>
        <AdminNav current="search" className="mt-4" />

        <nav aria-label="Period" className="mb-5 flex gap-2">
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
              Last {range} days
            </Link>
          ))}
        </nav>

        {totalImpressions === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-5" aria-hidden="true" />}
            title="No searches recorded yet"
            body="Numbers appear here once people search and results are shown."
          />
        ) : (
          <div className="space-y-6">
            <Card className="overflow-x-auto">
              <h2 className="px-4 pt-4 text-card-title text-ink">By tier</h2>
              <table className="mt-2 w-full min-w-[36rem] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className={TH}>Tier</th>
                    <th className={TH}>Impressions</th>
                    <th className={TH}>Clicks</th>
                    <th className={TH}>CTR</th>
                    <th className={TH}>Avg. position</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tiers.map((tier) => (
                    <tr key={tier.tier} className="border-b border-line last:border-0">
                      <td className={cn(TD, "font-medium")}>{TIER_NAMES[tier.tier]}</td>
                      <td className={TD}>{formatCount(tier.impressions, intl)}</td>
                      <td className={TD}>{formatCount(tier.clicks, intl)}</td>
                      <td className={TD}>{pct(tier.ctr)}</td>
                      <td className={TD}>{tier.avg_position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
                <h2 className="text-card-title text-ink">Monthly rotation fairness</h2>
                <p className="text-meta text-ink-muted">
                  {report.rotation.fairness === null
                    ? "Not enough data yet (needs subscribers shown 10+ times)"
                    : `Fairness ${report.rotation.fairness.toFixed(2)} across ${report.rotation.compared} subscribers - 1.00 is perfectly even`}
                </p>
              </div>
              {report.rotation.subscribers.length === 0 ? (
                <p className="px-4 pb-4 pt-2 text-body text-ink-muted">
                  No Monthly subscribers have been shown in this period.
                </p>
              ) : (
                <table className="mt-2 w-full min-w-[40rem] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={TH}>Business</th>
                      <th className={TH}>Impressions</th>
                      <th className={TH}>In the top three</th>
                      <th className={TH}>Share</th>
                      <th className={TH}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rotation.subscribers.map((s) => (
                      <tr key={s.business_id} className="border-b border-line last:border-0">
                        <td className={cn(TD, "font-medium")}>{s.name}</td>
                        <td className={TD}>{formatCount(s.impressions, intl)}</td>
                        <td className={TD}>{formatCount(s.leader_impressions, intl)}</td>
                        <td className={TD}>{pct(s.leader_share)}</td>
                        <td className={TD}>{pct(s.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="overflow-x-auto">
              <h2 className="px-4 pt-4 text-card-title text-ink">Top performers</h2>
              <p className="px-4 text-meta text-ink-muted">
                Highest click-through rate among listings shown at least 20 times.
              </p>
              {report.top_performers.length === 0 ? (
                <p className="px-4 pb-4 pt-2 text-body text-ink-muted">
                  No listing has been shown 20 times yet in this period.
                </p>
              ) : (
                <table className="mt-2 w-full min-w-[36rem] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={TH}>Business</th>
                      <th className={TH}>Tier</th>
                      <th className={TH}>Impressions</th>
                      <th className={TH}>Clicks</th>
                      <th className={TH}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_performers.map((p) => (
                      <tr key={p.business_id} className="border-b border-line last:border-0">
                        <td className={cn(TD, "font-medium")}>{p.name}</td>
                        <td className={TD}>{TIER_NAMES[p.tier]}</td>
                        <td className={TD}>{formatCount(p.impressions, intl)}</td>
                        <td className={TD}>{formatCount(p.clicks, intl)}</td>
                        <td className={TD}>{pct(p.ctr)}</td>
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
