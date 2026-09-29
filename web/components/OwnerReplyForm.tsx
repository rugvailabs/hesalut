"use client";

/**
 * Inline reply box shown under a review that has no owner reply yet.
 *
 * Once a reply exists this component renders nothing and the page shows the
 * reply instead. That is deliberate: the backend stores one reply per review,
 * so posting again silently overwrites the previous text. Leaving the form on
 * screen would invite exactly that mistake.
 *
 * On success it updates the row in place so the reply appears immediately,
 * then calls router.refresh() to re-run the Server Component and reconcile
 * with whatever the server actually stored.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { Button } from "@/components/ds/primitives";
import { FIELD, LABEL } from "@/components/ds/form";
import { tFor, type Locale } from "@/lib/i18n";

export default function OwnerReplyForm({
  businessId,
  reviewId,
  onReplied,
  locale,
}: {
  businessId: number;
  reviewId: number;
  /** Optimistic update: show the reply before the server round-trip lands. */
  onReplied: (reply: string) => void;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = reply.trim();
    if (!text) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/dashboard/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, review_id: reviewId, reply: text }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : t("dashboard.reviews.replyFailed", { status: res.status }),
        );
        return;
      }

      // Show it straight away, then let the server be the final word.
      onReplied(text);
      router.refresh();
    } catch {
      setError(t("dashboard.common.serverUnreachable"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 border-t border-line pt-3">
      <label className="block">
        <span className={LABEL}>
          {t("dashboard.reviews.replyLabel")}
        </span>
        <textarea
          rows={3}
          maxLength={2000}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={t("dashboard.reviews.replyPlaceholder")}
          className={FIELD}
        />
      </label>

      <p className="mt-1 text-meta text-ink-subtle">
        {t("dashboard.reviews.replyHint")}
      </p>

      {error !== null ? (
        <Alert locale={locale} tone="error" className="mt-2">{error}</Alert>
      ) : null}

      <div className="mt-2">
        <Button type="submit" size="sm" disabled={submitting || !reply.trim()}>
          {submitting ? t("dashboard.reviews.posting") : t("dashboard.reviews.postReply")}
        </Button>
      </div>
    </form>
  );
}
