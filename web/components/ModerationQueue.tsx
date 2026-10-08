"use client";

/**
 * The moderator's working list.
 *
 * A Client Component because a decision has to remove the row from the current
 * filter immediately - waiting a round trip to find out whether your click
 * landed is what makes people double-approve things.
 *
 * Reject and suspend take a reason the owner will read, so they open a small
 * inline prompt rather than firing on the first click. Approve does not: an
 * owner does not need to be told why they were let through.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import StatusBadge from "@/components/StatusBadge";
import WaitingTag from "@/components/WaitingTag";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { FIELD } from "@/components/ui/field";
import { categoryNameFromEnglish } from "@/lib/categories";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { ModerationAction, ModerationQueueItem } from "@/lib/types";

function formatWhen(iso: string, locale: Locale): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(INTL_LOCALE[locale], {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function ModerationQueue({
  items: initialItems,
  locale,
}: {
  items: ModerationQueueItem[];
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [promptFor, setPromptFor] = useState<{
    id: number;
    action: Exclude<ModerationAction, "approve">;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(
    businessId: number,
    action: ModerationAction,
    why?: string,
  ): Promise<void> {
    setError(null);
    setPendingId(businessId);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, action, reason: why }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : t("admin.queue.decisionError", { status: res.status }),
        );
        return;
      }

      // The row no longer belongs in this filter, so drop it and let
      // router.refresh() reconcile the counts from the server.
      setItems((current) => current.filter((item) => item.id !== businessId));
      setPromptFor(null);
      setReason("");
      router.refresh();
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold text-ink">{t("admin.queue.emptyTitle")}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t("admin.queue.emptyBody")}
        </p>
      </Card>
    );
  }

  return (
    <>
      {error !== null ? (
        <Alert locale={locale} tone="error" className="mb-3">{error}</Alert>
      ) : null}

      <ul className="space-y-3">
        {items.map((item) => {
          const busy = pendingId === item.id;
          return (
            <li key={item.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-ink">
                      <Link
                        href={`/admin/listings/${item.id}`}
                        className="rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      >
                        {item.name}
                      </Link>
                    </h2>
                    <p className="text-sm text-ink-subtle">
                      {categoryNameFromEnglish(item.category_name, locale)} · {item.city}, {item.province}
                      {item.address !== null ? ` · ${item.address}` : ""}
                    </p>
                    <p className="break-words text-sm text-ink-subtle">
                      {t("admin.queue.submitted", {
                        date: formatWhen(item.created_at, locale),
                      })}
                      {item.owner_email !== null
                        ? ` · ${item.owner_email}`
                        : ` · ${t("admin.queue.noOwner")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Newest first puts the longest-waiting last; this keeps it in view. */}
                    {item.status === "pending" ? (
                      <WaitingTag since={item.created_at} locale={locale} />
                    ) : null}
                    <StatusBadge status={item.status} locale={locale} />
                  </div>
                </div>

                {item.description !== null ? (
                  <p className="text-sm text-ink">{item.description}</p>
                ) : null}

                <div className="flex flex-wrap gap-3 text-sm text-ink-muted">
                  {item.phone !== null ? <span>{item.phone}</span> : null}
                  {item.website !== null ? (
                    <a
                      href={item.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline"
                    >
                      {item.website}
                    </a>
                  ) : null}
                </div>

                {item.moderation_note !== null ? (
                  <div className="rounded-md border-l-2 border-line-strong bg-surface-muted px-3 py-2">
                    <p className="text-xs font-medium text-ink-subtle">
                      {t("admin.queue.previousNote")}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {item.moderation_note}
                    </p>
                  </div>
                ) : null}

                {promptFor?.id === item.id ? (
                  <div className="rounded-md border border-line p-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-ink">
                        {promptFor.action === "reject"
                          ? t("admin.queue.reasonReject")
                          : t("admin.queue.reasonSuspend")}
                      </span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t("admin.queue.reasonPlaceholder")}
                        className={FIELD}
                      />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || reason.trim().length < 3}
                        onClick={() => decide(item.id, promptFor.action, reason.trim())}
                      >
                        {busy
                          ? t("admin.common.applying")
                          : promptFor.action === "reject"
                            ? t("admin.queue.confirmReject")
                            : t("admin.queue.confirmSuspend")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPromptFor(null);
                          setReason("");
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {item.status !== "approved" ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => decide(item.id, "approve")}
                      >
                        {busy ? t("admin.common.applying") : t("admin.common.approve")}
                      </Button>
                    ) : null}
                    {item.status !== "rejected" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setPromptFor({ id: item.id, action: "reject" });
                          setReason("");
                        }}
                      >
                        {t("admin.common.reject")}
                      </Button>
                    ) : null}
                    {item.status === "approved" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setPromptFor({ id: item.id, action: "suspend" });
                          setReason("");
                        }}
                      >
                        {t("admin.common.suspend")}
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
