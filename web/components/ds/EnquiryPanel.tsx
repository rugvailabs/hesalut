"use client";

/**
 * Callback / quote request on a public listing page.
 *
 * The behaviour is Step 3's EnquiryForm, unchanged: it posts to our own route
 * handler (the API has no CORS and the JWT is in an httpOnly cookie), it works
 * signed in or out against the backend's optional-auth endpoint, and a signed-
 * in visitor's account fills any field they leave blank - the fields are still
 * offered either way, because the number to call back on is often not the one
 * on the account.
 *
 * What changed is the styling and that it is now addressable. ListingCard
 * links to /business/{slug}#enquire, so this panel owns that id and opens
 * itself when the URL points at it - otherwise following that link from a
 * search result landed on a collapsed button with no indication of why.
 */

import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";

import { Button, Card, Input, Label } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";
import type { EnquiryType } from "@/lib/types";

type Kind = Extract<EnquiryType, "callback" | "quote">;

const FIELD =
  "h-10 w-full rounded-input border border-line-strong bg-surface px-3 text-body " +
  "text-ink placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function EnquiryPanel({
  businessId,
  businessName,
  locale = "en",
  className,
}: {
  businessId: number;
  businessName: string;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("callback");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // Arriving on #enquire from a search result should show the form, not a
  // button the visitor has to find and press a second time.
  useEffect(() => {
    if (window.location.hash === "#enquire") setOpen(true);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          enquiry_type: kind,
          message: message.trim() || null,
          contact_name: name.trim() || null,
          contact_phone: phone.trim() || null,
          contact_email: email.trim() || null,
        }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : t("discover.business.enquiryHttpError", { status: res.status }),
        );
        return;
      }
      setSent(true);
    } catch {
      setError(t("business.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card
        id="enquire"
        className={cn("scroll-mt-24 border-success/30 bg-success-bg p-4", className)}
      >
        {/* Announced, because the form it replaced is gone from the page and a
            silent swap leaves a screen-reader user with no confirmation. */}
        <div role="status">
          <h2 className="text-card-title text-success">{t("business.enquireSent")}</h2>
          <p className="mt-1 text-body text-ink-muted">
            {t("business.enquireSentBody", { name: businessName })}
          </p>
        </div>
      </Card>
    );
  }

  if (!open) {
    return (
      <div id="enquire" className={cn("scroll-mt-24", className)}>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Mail aria-hidden="true" />
          {t("business.enquireOpen")}
        </Button>
      </div>
    );
  }

  return (
    <Card id="enquire" className={cn("scroll-mt-24 p-4", className)}>
      <h2 ref={headingRef} className="text-section-heading text-ink">
        {t("business.enquireContact", { name: businessName })}
      </h2>

      <form onSubmit={onSubmit} className="mt-3 space-y-4">
        <fieldset>
          <legend className="sr-only">{t("business.enquireHeading")}</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "callback", label: t("business.kindCallback") },
                { value: "quote", label: t("business.kindQuote") },
              ] as { value: Kind; label: string }[]
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-input border px-3 py-1.5 text-body transition-colors",
                  // focus-within, because the input that takes focus is
                  // visually hidden - without this the ring never appears and
                  // the group is unusable by keyboard.
                  "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                  kind === option.value
                    ? "border-brand-700 bg-brand-700 text-ink-inverse"
                    : "border-line-strong bg-surface text-ink hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="enquiry-message">{t("business.fieldMessage")}</Label>
          <textarea
            id="enquiry-message"
            rows={3}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("business.fieldMessagePlaceholder")}
            className={cn(FIELD, "h-auto py-2")}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="enquiry-name">{t("business.fieldName")}</Label>
            <Input
              id="enquiry-name"
              maxLength={255}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="enquiry-phone">{t("business.fieldPhone")}</Label>
            <Input
              id="enquiry-phone"
              type="tel"
              maxLength={32}
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="enquiry-email">{t("business.fieldEmail")}</Label>
            <Input
              id="enquiry-email"
              type="email"
              maxLength={320}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <p className="text-meta text-ink-subtle">{t("business.signedInHint")}</p>

        {error !== null ? (
          <p
            role="alert"
            className="rounded-input border border-danger/30 bg-danger-bg px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? t("business.sending") : t("business.send")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
