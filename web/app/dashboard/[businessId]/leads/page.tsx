/**
 * Leads inbox for one listing.
 *
 * This is where the click-to-call tracking on the public page becomes worth
 * something: every reveal of the phone number shows up here as a lead.
 *
 * Ownership is enforced by the backend (403 for somebody else's listing). The
 * page turns that into a redirect rather than a crash.
 *
 * The table keeps its own horizontal scroll rather than collapsing to cards on
 * a narrow screen: a lead is four short columns that are read across - who,
 * what, how to reach them, when - and stacking them costs the comparison an
 * owner is actually making when scanning the list.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";

import DashboardNav from "@/components/ds/DashboardNav";
import SearchPerformanceCard from "@/components/ds/SearchPerformanceCard";
import SiteFooter from "@/components/ds/SiteFooter";
import { EmptyState } from "@/components/ds/feedback";
import { Badge, Button } from "@/components/ds/primitives";
import {
  ApiError,
  getBusinessSearchPerformance,
  getEnquiries,
  getMyBusiness,
} from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import { formatPhone, telHref } from "@/lib/format";
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import type {
  BusinessDetail,
  BusinessSearchPerformance,
  EnquiryOut,
  EnquiryType,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];

/**
 * The four lead kinds, each on a token rather than a hand-picked hue.
 *
 * call_click is the passive one - the visitor took your number and may never
 * ring - so it reads as neutral. The three that carry a message someone is
 * waiting on are given weight.
 */
const TYPES: Record<
  EnquiryType,
  { label: string; tone: "neutral" | "brand" | "warning" | "success" }
> = {
  call_click: { label: "Call", tone: "neutral" },
  callback: { label: "Callback", tone: "warning" },
  quote: { label: "Quote", tone: "brand" },
  chat: { label: "Chat", tone: "success" },
};

/** Absolute timestamp - an owner chasing a lead needs the date, not "2h ago". */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(intl, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default async function LeadsPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  await requireBusinessOwner(`/dashboard/${params.businessId}/leads`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  let leads: EnquiryOut[];
  try {
    // Sequential rather than parallel: if the ownership check fails there is
    // no point having fetched the leads.
    listing = await getMyBusiness(businessId);
    leads = await getEnquiries(businessId, { limit: 100 });
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      redirect("/dashboard?error=forbidden");
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const callClicks = leads.filter((l) => l.enquiry_type === "call_click").length;
  // Secondary to the leads themselves: if it cannot load, the page still works.
  const performance: BusinessSearchPerformance | null = await getBusinessSearchPerformance(
    businessId,
  ).catch(() => null);

  return (
    <>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Button asChild variant="link" size="sm" className="-ml-1 h-auto px-1">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            Your listings
          </Link>
        </Button>

        <h1 className="mt-2 text-page-title text-ink">Leads for {listing.name}</h1>
        <p className="mt-1 text-body text-ink-muted">
          {leads.length === 0
            ? "No enquiries yet."
            : `${leads.length} ${leads.length === 1 ? "enquiry" : "enquiries"}` +
              (callClicks > 0
                ? ` · ${callClicks} phone ${callClicks === 1 ? "reveal" : "reveals"}`
                : "")}
        </p>

        <DashboardNav
          businessId={businessId}
          current="leads"
          className="mt-4"
          newLeads={leads.length}
        />

        {performance !== null ? (
          <div className="mt-4">
            <SearchPerformanceCard performance={performance} intl={intl} />
          </div>
        ) : null}

        {leads.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Inbox className="size-5" aria-hidden="true" />}
            title="No enquiries yet"
            body={
              listing.status === "approved"
                ? "When someone reveals your phone number or sends a request from your listing, it will appear here."
                : "This listing is not publicly visible yet, so customers cannot contact it."
            }
            action={{ label: "Back to listings", href: "/dashboard" }}
          />
        ) : (
          <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-body">
              <caption className="sr-only">
                Enquiries for {listing.name}, most recent first
              </caption>
              <thead>
                <tr className="border-b border-line text-left text-meta text-ink-muted">
                  <th scope="col" className="px-4 py-2 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2 font-medium">Message</th>
                  <th scope="col" className="px-4 py-2 font-medium">Contact</th>
                  <th scope="col" className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const type = TYPES[lead.enquiry_type];
                  const tel = telHref(lead.contact_phone);

                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-line align-top last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <Badge tone={type.tone}>{type.label}</Badge>
                      </td>

                      <td className="px-4 py-3 text-ink-muted">
                        {lead.message ?? (
                          <span className="text-ink-subtle">
                            {lead.enquiry_type === "call_click"
                              ? "Revealed your phone number"
                              : "—"}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-ink">{lead.contact_name ?? "—"}</div>
                        {lead.contact_phone !== null ? (
                          tel !== null ? (
                            <a
                              href={tel}
                              className="rounded-sm tabular text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {formatPhone(lead.contact_phone)}
                            </a>
                          ) : (
                            <span className="tabular text-ink-muted">
                              {lead.contact_phone}
                            </span>
                          )
                        ) : null}
                        {lead.contact_email !== null ? (
                          <div className="truncate text-meta text-ink-subtle">
                            {lead.contact_email}
                          </div>
                        ) : null}
                        {lead.user_id === null ? (
                          <div className="text-meta text-ink-subtle">
                            Anonymous visitor
                          </div>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 tabular text-ink-muted">
                        {formatWhen(lead.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
