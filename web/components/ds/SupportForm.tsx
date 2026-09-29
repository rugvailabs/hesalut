"use client";

/**
 * One form for customer care, feedback and bug reports.
 *
 * Three separate pages would have been three copies of the same fields with
 * three different headings; the only thing that genuinely differs is what we
 * need alongside the message. So the kind is a control, preselected from
 * ?kind= so a footer link can land on the right one, and the bug-report case
 * adds the two fields that make a report actionable.
 *
 * The browser string is filled in from navigator.userAgent rather than read
 * off the request server-side, because the reporter's browser is the one that
 * matters and it is the reporter who is describing the problem. It is shown,
 * not hidden - somebody reporting a bug should be able to see everything they
 * are about to send.
 *
 * The language arrives as a prop from the server page: a client component
 * cannot read the cookie through lib/i18n/server. A backend `detail` error is
 * shown as the server wrote it, untranslated.
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { FIELD, HINT, LABEL, SELECT, TEXTAREA } from "@/components/ds/form";
import { Button, Card } from "@/components/ds/primitives";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";

type Kind = "enquiry" | "feedback" | "bug";

// The labels and blurbs come from the dictionary (pages.support.kinds.<value>).
const KINDS: Kind[] = ["enquiry", "feedback", "bug"];

/** The message field's length limit, also shown in its hint. */
const MAX_MESSAGE = 5000;

function isKind(value: string | null): value is Kind {
  return value === "enquiry" || value === "feedback" || value === "bug";
}

export default function SupportForm({ locale }: { locale: Locale }): JSX.Element {
  const t = tFor(locale);
  const number = (value: number): string => value.toLocaleString(INTL_LOCALE[locale]);
  const params = useSearchParams();
  const requested = params.get("kind");

  const [kind, setKind] = useState<Kind>(isKind(requested) ? requested : "enquiry");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [userAgent, setUserAgent] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  // Client-only: there is no navigator during the server render.
  useEffect(() => {
    setUserAgent(window.navigator.userAgent);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim() || null,
          email: email.trim(),
          subject: subject.trim() || null,
          message: message.trim(),
          // Only sent on a bug report; noise on the other two.
          page_url: kind === "bug" ? pageUrl.trim() || null : null,
          user_agent: kind === "bug" ? userAgent || null : null,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("pages.support.httpError", { status: res.status }),
        );
        return;
      }

      const id =
        payload && typeof payload === "object" && "id" in payload
          ? Number((payload as { id: unknown }).id)
          : null;
      setSent(Number.isFinite(id) ? (id as number) : 0);
    } catch {
      setError(t("pages.support.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent !== null) {
    return (
      <Card className="border-success/30 bg-success-bg p-4">
        <div role="status">
          <h2 className="text-card-title text-success">{t("pages.support.sentTitle")}</h2>
          <p className="mt-1 text-body text-ink-muted">
            {sent > 0 ? (
              <>
                {t("pages.support.sentReference")}{" "}
                <span className="tabular">#{sent}</span>.{" "}
                {t("pages.support.sentReply")}
              </>
            ) : (
              <>{t("pages.support.sentReply")}</>
            )}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="support-kind" className={LABEL}>
            {t("pages.support.kindLabel")}
          </label>
          <select
            id="support-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as Kind)}
            className={SELECT}
          >
            {KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`pages.support.kinds.${option}.label`)}
              </option>
            ))}
          </select>
          <p className={HINT}>{t(`pages.support.kinds.${kind}.blurb`)}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="support-name" className={LABEL}>
              {t("pages.support.nameLabel")}{" "}
              <span className="font-normal">{t("pages.support.optional")}</span>
            </label>
            <input
              id="support-name"
              type="text"
              maxLength={255}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="support-email" className={LABEL}>
              {t("pages.support.emailLabel")}
            </label>
            <input
              id="support-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className={FIELD}
            />
            <p className={HINT}>{t("pages.support.emailHint")}</p>
          </div>
        </div>

        <div>
          <label htmlFor="support-subject" className={LABEL}>
            {t("pages.support.subjectLabel")}{" "}
            <span className="font-normal">{t("pages.support.optional")}</span>
          </label>
          <input
            id="support-subject"
            type="text"
            maxLength={255}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="support-message" className={LABEL}>
            {kind === "bug"
              ? t("pages.support.bugMessageLabel")
              : t("pages.support.messageLabel")}
          </label>
          <textarea
            id="support-message"
            required
            rows={6}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={
              kind === "bug"
                ? t("pages.support.bugPlaceholder")
                : undefined
            }
            className={TEXTAREA}
          />
          <p className={HINT}>
            {message.length > 0
              ? t("pages.support.charCount", {
                  count: number(message.length),
                  max: number(MAX_MESSAGE),
                })
              : t("pages.support.charLimit", { max: number(MAX_MESSAGE) })}
          </p>
        </div>

        {kind === "bug" ? (
          <div className="space-y-4 rounded-input border border-line bg-surface-muted p-3">
            <div>
              <label htmlFor="support-url" className={LABEL}>
                {t("pages.support.pageLabel")}{" "}
                <span className="font-normal">{t("pages.support.optional")}</span>
              </label>
              <input
                id="support-url"
                type="text"
                inputMode="url"
                maxLength={2048}
                value={pageUrl}
                onChange={(event) => setPageUrl(event.target.value)}
                placeholder={t("pages.support.pagePlaceholder")}
                className={FIELD}
              />
            </div>
            <div>
              <span className={LABEL}>{t("pages.support.browserLabel")}</span>
              {/* Shown rather than sent silently: nobody should have to guess
                  what a bug report is attaching about them. */}
              <p className="break-words text-meta text-ink-subtle">
                {userAgent || t("pages.support.notDetected")}
              </p>
              <p className={HINT}>{t("pages.support.browserHint")}</p>
            </div>
          </div>
        ) : null}

        {error !== null ? <Alert locale={locale} tone="error">{error}</Alert> : null}

        <Button type="submit" disabled={submitting}>
          {submitting ? t("pages.support.sending") : t("pages.support.send")}
        </Button>
      </form>
    </Card>
  );
}
