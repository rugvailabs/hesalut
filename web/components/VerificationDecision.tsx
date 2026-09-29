"use client";

/**
 * Approve or reject one KYC submission.
 *
 * Approve is one click: it is the common case, it is reversible by rejecting
 * afterwards, and adding a confirmation to the action a reviewer takes forty
 * times an hour just trains them to click through confirmations.
 *
 * Reject is not, because it requires a reason the owner will read and act on.
 * The reason field IS the confirmation - there is no separate "are you sure",
 * because writing a sentence is already a deliberate act.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { FIELD, LABEL } from "@/components/ui/field";
import { tFor, type Locale } from "@/lib/i18n";
import type { VerificationStatus } from "@/lib/types";

interface Props {
  verificationId: number;
  businessName: string;
  status: VerificationStatus;
  /** Where to go after a decision. Omit to stay put and just refresh. */
  redirectTo?: string;
  locale: Locale;
}

export default function VerificationDecision({
  verificationId,
  businessName,
  status,
  redirectTo,
  locale,
}: Props): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  async function decide(
    action: "approve" | "reject",
    body: Record<string, unknown> = {},
  ): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_id: verificationId,
          action,
          ...body,
        }),
      });

      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t(
                action === "approve"
                  ? "admin.decision.approveError"
                  : "admin.decision.rejectError",
                { status: res.status },
              ),
        );
        return;
      }

      setDone(action === "approve" ? "approved" : "rejected");
      setRejecting(false);
      // The queue is a Server Component, so this is what drops the row out of
      // it. When this is the detail page, the panel above repaints instead.
      router.refresh();
      if (redirectTo !== undefined) router.push(redirectTo);
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setBusy(null);
    }
  }

  if (done !== null) {
    return (
      <Alert locale={locale} tone={done === "approved" ? "success" : "info"}>
        {done === "approved"
          ? t("admin.decision.approvedDone", { name: businessName })
          : t("admin.decision.rejectedDone", { name: businessName })}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error !== null ? <Alert locale={locale} tone="error">{error}</Alert> : null}

      {status !== "pending" ? (
        <p className="text-sm text-ink-muted">
          {t("admin.decision.alreadyDecided", {
            status: t(`admin.decision.statusWords.${status}`),
          })}
        </p>
      ) : null}

      {rejecting ? (
        <div className="rounded-md border border-line bg-surface-muted p-4">
          <label htmlFor={`reason-${verificationId}`} className={LABEL}>
            {t("admin.decision.reasonLabel")}
          </label>
          <textarea
            id={`reason-${verificationId}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={FIELD}
            placeholder={t("admin.decision.reasonPlaceholder")}
            autoFocus
          />
          <p className="mt-1 text-xs text-ink-subtle">
            {t("admin.decision.reasonHint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => void decide("reject", { reason })}
            >
              {busy === "reject"
                ? t("admin.decision.rejecting")
                : t("admin.decision.rejectSubmission")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRejecting(false);
                setError(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy !== null}
            onClick={() => void decide("approve")}
          >
            {busy === "approve"
              ? t("admin.decision.approving")
              : t("admin.common.approve")}
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            {t("admin.decision.rejectOpen")}
          </Button>
        </div>
      )}
    </div>
  );
}
