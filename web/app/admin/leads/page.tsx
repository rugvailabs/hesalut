/**
 * /admin/leads - every enquiry in the directory.
 *
 * The gap this fills: admin had a `total_enquiries` number on the overview and
 * no way to see a single one of them. An owner could read their own leads; a
 * moderator investigating "this business says it gets no enquiries" had a
 * count and nothing else.
 *
 * Filters live in the URL rather than in state, the same rule /search follows,
 * so a filtered inbox is a link somebody can send. The export button carries
 * the same filters, because an export that quietly ignores the filter you set
 * is worse than no export.
 *
 * These rows carry contact details customers gave to a business, not to us.
 * Every read is audit-logged server-side, and the page says so, because a
 * moderator should know their access to this is recorded.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox } from "lucide-react";

import AdminNav from "@/components/AdminNav";
import SiteFooter from "@/components/ds/SiteFooter";
import { Alert, EmptyState } from "@/components/ds/feedback";
import { Badge, Button } from "@/components/ds/primitives";
import { ApiError, getAdminEnquiries, getAdminStats } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { formatCount, formatPhone } from "@/lib/format";
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n";
import type { AdminEnquiryPage, EnquiryType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads" };

const locale = DEFAULT_LOCALE;
const intl = INTL_LOCALE[locale];
const PAGE_SIZE = 50;

const TYPES: Record<
  EnquiryType,
  { label: string; tone: "neutral" | "brand" | "warning" | "success" }
> = {
  call_click: { label: "Call", tone: "neutral" },
  callback: { label: "Callback", tone: "warning" },
  quote: { label: "Quote", tone: "brand" },
  chat: { label: "Chat", tone: "success" },
};

function isType(value: string | undefined): value is EnquiryType {
  return value !== undefined && value in TYPES;
}

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

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: { type?: string; page?: string };
}): Promise<JSX.Element> {
  await requireAdmin("/admin/leads");

  const type = isType(searchParams.type) ? searchParams.type : undefined;
  const parsedPage = Number(searchParams.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  let leads: AdminEnquiryPage | null = null;
  let error: string | null = null;
  try {
    leads = await getAdminEnquiries({
      enquiry_type: type,
      page,
      page_size: PAGE_SIZE,
    });
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the leads.";
  }

  // Counts for the nav badges. Failing here must not cost the page.
  const stats = await getAdminStats().catch(() => null);

  const exportHref = `/api/admin/leads/export${type ? `?enquiry_type=${type}` : ""}`;
  const filterHref = (value?: EnquiryType): string =>
    value === undefined ? "/admin/leads" : `/admin/leads?type=${value}`;

  return (
    <>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-page-title text-ink">Leads</h1>
        <p className="mt-1 text-body text-ink-muted">
          Every enquiry left on any listing, newest first.
        </p>

        <AdminNav
          current="leads"
          pendingListings={stats?.pending_listings}
          pendingVerifications={stats?.pending_verifications}
          className="mt-4"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
            <Button asChild variant={type === undefined ? "primary" : "secondary"} size="sm">
              <Link href={filterHref()}>All</Link>
            </Button>
            {(Object.keys(TYPES) as EnquiryType[]).map((value) => (
              <Button
                key={value}
                asChild
                variant={type === value ? "primary" : "secondary"}
                size="sm"
              >
                <Link href={filterHref(value)}>{TYPES[value].label}</Link>
              </Button>
            ))}
          </div>

          <Button asChild variant="secondary" size="sm">
            {/* A real navigation, not fetch(): letting the browser handle the
                response is what makes Content-Disposition save a file. */}
            <a href={exportHref} download>
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        </div>

        {error !== null ? (
          <Alert tone="error" title="Could not load leads" className="mt-4">
            {error}
          </Alert>
        ) : leads === null || leads.items.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Inbox className="size-5" aria-hidden="true" />}
            title={type === undefined ? "No enquiries yet" : "None of that type"}
            body={
              type === undefined
                ? "When somebody reveals a phone number or sends a request from a listing, it appears here."
                : "Try a different type, or clear the filter."
            }
            action={{ label: "Clear filter", href: "/admin/leads" }}
          />
        ) : (
          <>
            <p className="mt-4 text-meta text-ink-subtle">
              {formatCount(leads.total, intl)}{" "}
              {leads.total === 1 ? "enquiry" : "enquiries"}
              {type !== undefined ? ` of type ${TYPES[type].label.toLowerCase()}` : ""} ·
              page {leads.page} of {leads.total_pages}
            </p>

            <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full border-collapse text-body">
                <caption className="sr-only">
                  Enquiries across all listings, newest first
                </caption>
                <thead>
                  <tr className="border-b border-line text-left text-meta text-ink-muted">
                    <th scope="col" className="px-4 py-2 font-medium">Type</th>
                    <th scope="col" className="px-4 py-2 font-medium">Listing</th>
                    <th scope="col" className="px-4 py-2 font-medium">Message</th>
                    <th scope="col" className="px-4 py-2 font-medium">Contact</th>
                    <th scope="col" className="px-4 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.items.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-line align-top last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <Badge tone={TYPES[lead.enquiry_type].tone}>
                          {TYPES[lead.enquiry_type].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/business/${lead.business_slug}`}
                          className="rounded-sm text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {lead.business_name}
                        </Link>
                      </td>
                      <td className="max-w-sm px-4 py-3 text-ink-muted">
                        {lead.message ?? (
                          <span className="text-ink-subtle">
                            {lead.enquiry_type === "call_click"
                              ? "Revealed the phone number"
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink">{lead.contact_name ?? "—"}</div>
                        {lead.contact_phone !== null ? (
                          <div className="tabular text-ink-muted">
                            {formatPhone(lead.contact_phone)}
                          </div>
                        ) : null}
                        {lead.contact_email !== null ? (
                          <div className="truncate text-meta text-ink-subtle">
                            {lead.contact_email}
                          </div>
                        ) : null}
                        {lead.user_id === null ? (
                          <div className="text-meta text-ink-subtle">Anonymous</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular text-ink-muted">
                        {formatWhen(lead.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {leads.total_pages > 1 ? (
              <nav
                className="mt-4 flex items-center justify-between gap-2"
                aria-label="Pagination"
              >
                <Button
                  asChild={leads.page > 1}
                  variant="secondary"
                  size="sm"
                  disabled={leads.page <= 1}
                >
                  {leads.page > 1 ? (
                    <Link
                      href={`/admin/leads?${new URLSearchParams({
                        ...(type ? { type } : {}),
                        page: String(leads.page - 1),
                      })}`}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>

                <Button
                  asChild={leads.page < leads.total_pages}
                  variant="secondary"
                  size="sm"
                  disabled={leads.page >= leads.total_pages}
                >
                  {leads.page < leads.total_pages ? (
                    <Link
                      href={`/admin/leads?${new URLSearchParams({
                        ...(type ? { type } : {}),
                        page: String(leads.page + 1),
                      })}`}
                    >
                      Next
                    </Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </nav>
            ) : null}
          </>
        )}

        <p className="mt-6 max-w-prose text-meta text-ink-subtle">
          These are contact details customers gave to a business, not to us.
          Reading this page and exporting it are both recorded in the audit log.
        </p>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
