"use client";

/**
 * Ask a business for a booking: choose a service, suggest up to three times,
 * check your details, agree to share them, send.
 *
 * Times are entered as the business sees them - a date plus a clock time (an
 * appointment) or a part of the day (a visit window) - and the server turns
 * them into instants in the business's own time zone, so the browser's zone
 * never decides when a visit happens.
 *
 * The date field cannot grey out closed days (a native date input has no such
 * hook), so a closed day is refused as soon as it is chosen, in words, before
 * the form is sent. The server checks again; this is the courtesy, not the rule.
 */

import Link from "next/link";
import { useRef, useState } from "react";
import { CalendarCheck, Plus, X } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { FIELD, HINT, LABEL, TEXTAREA } from "@/components/ds/form";
import { Button, Card } from "@/components/ds/primitives";
import { dayFromToday, formatPrice, isOpenOn, PARTS } from "@/lib/booking-format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { BookingInfo, PartOfDay } from "@/lib/types";

interface Option {
  date: string;
  time: string;
  part: PartOfDay | "";
}

const EMPTY: Option = { date: "", time: "", part: "" };

export default function BookingRequestForm({
  info,
  businessName,
  slug,
  customer,
  locale = "en",
}: {
  info: BookingInfo;
  businessName: string;
  slug: string;
  customer: { name: string; email: string; phone: string | null };
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const windowStyle = info.style === "window";

  // One key for this form's lifetime: pressing Send twice, or retrying after a
  // dropped connection, then reaches the server as the same request.
  const idempotencyKey = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
  );

  const [serviceId, setServiceId] = useState<number | null>(
    info.services.length === 1 ? info.services[0].id : null,
  );
  const [options, setOptions] = useState<Option[]>([EMPTY]);
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setOption(index: number, patch: Partial<Option>): void {
    setOptions((current) => current.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function onDate(index: number, value: string): void {
    setOption(index, { date: value });
    setDayErrors((current) => {
      const next = { ...current };
      if (value && !isOpenOn(info.opening_hours, value)) {
        next[index] = t("booking.form.closedDay");
      } else {
        delete next[index];
      }
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (serviceId === null) {
      setError(t("booking.form.needService"));
      return;
    }
    const complete = options.every((o) => o.date && (windowStyle ? o.part : o.time));
    if (!complete || Object.keys(dayErrors).length > 0) {
      setError(Object.keys(dayErrors).length > 0 ? t("booking.form.closedDay") : t("booking.form.needTime"));
      return;
    }
    if (!consent) {
      setError(t("booking.form.needConsent"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          business_id: info.business_id,
          service_id: serviceId,
          proposals: options.map((o) =>
            windowStyle ? { date: o.date, part: o.part } : { date: o.date, time: o.time },
          ),
          phone: phone.trim() || null,
          note: note.trim() || null,
          consent_shared: true,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("booking.form.networkError"),
        );
        return;
      }
      setDone(true);
    } catch {
      setError(t("booking.form.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="border-success/30 bg-success-bg p-5">
        <div role="status">
          <h2 className="text-card-title text-success">{t("booking.form.doneTitle")}</h2>
          <p className="mt-1 text-body text-ink-muted">
            {t("booking.form.doneBody", { name: businessName })}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/account/bookings">{t("booking.form.viewBookings")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/business/${slug}`}>{t("booking.form.backToListing")}</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const earliest = dayFromToday(1);
  const latest = dayFromToday(60);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="text-body text-ink-muted">{t("booking.form.intro", { name: businessName })}</p>

      <Card className="p-4">
        <fieldset>
          <legend className="text-card-title text-ink">{t("booking.form.service")}</legend>
          <div className="mt-3 space-y-2">
            {info.services.map((service) => {
              const price = formatPrice(service.price_cents, intl);
              return (
                <label
                  key={service.id}
                  className="flex cursor-pointer items-start gap-3 rounded-input border border-line-strong p-3 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="service"
                    checked={serviceId === service.id}
                    onChange={() => setServiceId(service.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{service.name}</span>
                    <span className="block text-meta text-ink-muted">
                      {t("booking.form.minutes", { minutes: service.duration_minutes })}
                      {" · "}
                      {price ?? t("booking.form.priceOnRequest")}
                    </span>
                    {service.description ? (
                      <span className="mt-0.5 block text-meta text-ink-subtle">{service.description}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <Card className="p-4">
        <h2 className="text-card-title text-ink">{t("booking.form.times")}</h2>
        <p className={HINT}>
          {t(windowStyle ? "booking.form.timesHintWindow" : "booking.form.timesHintAppointment", {
            max: info.max_proposed,
          })}
        </p>
        <p className={HINT}>{t("booking.form.zone", { zone: info.timezone })}</p>

        <div className="mt-3 space-y-3">
          {options.map((option, index) => (
            <div key={index} className="rounded-input border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-meta font-medium text-ink">
                  {t("booking.form.timeN", { n: index + 1 })}
                </span>
                {options.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOptions((c) => c.filter((_, i) => i !== index));
                      setDayErrors({});
                    }}
                    className="inline-flex items-center gap-1 rounded-sm text-meta text-ink-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    {t("booking.form.removeTime")}
                  </button>
                ) : null}
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>{t("booking.form.date")}</span>
                  <input
                    type="date"
                    min={earliest}
                    max={latest}
                    value={option.date}
                    onChange={(e) => onDate(index, e.target.value)}
                    aria-invalid={dayErrors[index] ? true : undefined}
                    className={FIELD}
                  />
                  {dayErrors[index] ? (
                    <span className="mt-1 block text-meta text-danger">{dayErrors[index]}</span>
                  ) : null}
                </label>
                {windowStyle ? (
                  <label className="block">
                    <span className={LABEL}>{t("booking.form.part")}</span>
                    <select
                      value={option.part}
                      onChange={(e) => setOption(index, { part: e.target.value as PartOfDay | "" })}
                      className={`${FIELD} pr-8`}
                    >
                      <option value="" />
                      {PARTS.map((part) => (
                        <option key={part} value={part}>
                          {t(`booking.parts.${part}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block">
                    <span className={LABEL}>{t("booking.form.time")}</span>
                    <input
                      type="time"
                      step={900}
                      value={option.time}
                      onChange={(e) => setOption(index, { time: e.target.value })}
                      className={FIELD}
                    />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        {options.length < info.max_proposed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setOptions((c) => [...c, EMPTY])}
          >
            <Plus aria-hidden="true" />
            {t("booking.form.addTime")}
          </Button>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="text-card-title text-ink">{t("booking.form.details")}</h2>
        <p className={HINT}>{t("booking.form.detailsHint")}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className={LABEL}>{t("booking.form.name")}</dt>
            <dd className="text-body text-ink">{customer.name}</dd>
          </div>
          <div>
            <dt className={LABEL}>{t("booking.form.email")}</dt>
            <dd className="break-words text-body text-ink">{customer.email}</dd>
          </div>
        </dl>
        <label className="mt-3 block">
          <span className={LABEL}>{t("booking.form.phone")}</span>
          <input
            type="tel"
            maxLength={32}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            className={FIELD}
          />
        </label>
        <label className="mt-3 block">
          <span className={LABEL}>{t("booking.form.note")}</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("booking.form.notePlaceholder")}
            className={TEXTAREA}
          />
        </label>
      </Card>

      <Card className="p-4">
        <h2 className="text-card-title text-ink">{t("booking.form.policy")}</h2>
        <p className="mt-1 whitespace-pre-line text-body text-ink-muted">
          {info.cancellation_policy ?? t("booking.form.noPolicy")}
        </p>
        <label className="mt-4 flex items-start gap-2 text-body text-ink">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          {t("booking.form.consent", { name: businessName })}
        </label>
      </Card>

      {error ? <Alert locale={locale}>{error}</Alert> : null}

      <Button type="submit" size="lg" disabled={submitting}>
        <CalendarCheck aria-hidden="true" />
        {submitting ? t("booking.form.sending") : t("booking.form.submit")}
      </Button>
    </form>
  );
}
