"use client";

/**
 * The owner's Bookings tab: requests waiting for an answer, everything else,
 * and the list of services that can be booked.
 *
 * Accepting is one click on one of the times the customer suggested. For a
 * visit window (plumbers, movers...) the owner also picks the arrival time
 * inside the window, offered in half-hour steps. Every action goes through the
 * same-origin route handler and replaces the row with what the server
 * returned, so a stale screen cannot show a state the server has moved past
 * (the server answers 409 and the message is shown).
 */

import { useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { FIELD, HINT, LABEL, TEXTAREA } from "@/components/ds/form";
import { Badge, Button, Card } from "@/components/ds/primitives";
import {
  formatBookingClock,
  formatBookingDay,
  formatBookingTime,
  formatPrice,
} from "@/lib/booking-format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { BookableService, Booking, BookingAction, BookingStatus } from "@/lib/types";

const TONES: Record<BookingStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  requested: "warning",
  confirmed: "success",
  declined: "danger",
  cancelled: "neutral",
  expired: "neutral",
  completed: "brand",
  no_show: "danger",
};

async function post(
  businessId: number,
  bookingId: number,
  action: BookingAction,
  body: unknown,
): Promise<{ ok: true; booking: Booking } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/dashboard/bookings/${businessId}/${bookingId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        payload && typeof payload === "object" && "detail" in payload
          ? String((payload as { detail: unknown }).detail)
          : "Request failed.";
      return { ok: false, message };
    }
    return { ok: true, booking: payload as Booking };
  } catch {
    return { ok: false, message: "Could not reach the server." };
  }
}

/** Half-hour arrival choices inside a window, as ISO instants. */
function arrivalChoices(startIso: string, endIso: string, minutes: number): string[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const choices: string[] = [];
  for (let at = start; at < end; at += 30 * 60 * 1000) {
    // Leave room for the visit itself where the window allows it.
    if (at + minutes * 60 * 1000 <= end + 60 * 60 * 1000) choices.push(new Date(at).toISOString());
  }
  return choices.length > 0 ? choices : [startIso];
}

function PendingCard({
  businessId,
  booking,
  locale,
  onChange,
}: {
  businessId: number;
  booking: Booking;
  locale: Locale;
  onChange: (b: Booking) => void;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const zone = booking.timezone;
  const windowStyle = booking.style === "window";
  const [arrival, setArrival] = useState<Record<number, string>>({});
  const [declining, setDeclining] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: BookingAction, body: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await post(businessId, booking.id, action, body);
    setBusy(false);
    if (result.ok) onChange(result.booking);
    else setError(result.message);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-card-title text-ink">{booking.service_name}</h3>
          <p className="text-meta text-ink-muted">
            {t("booking.form.minutes", { minutes: booking.duration_minutes })}
            {formatPrice(booking.price_cents, intl) ? ` · ${formatPrice(booking.price_cents, intl)}` : ""}
          </p>
        </div>
        {booking.expires_at ? (
          <span className="text-meta text-ink-subtle">
            {t("booking.owner.expiresIn", { when: formatBookingTime(booking.expires_at, zone, intl) })}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-body text-ink">
        <span className="font-medium">{t("booking.owner.customer")}:</span> {booking.customer_name}
        {" · "}
        <a className="text-brand-700 hover:underline" href={`mailto:${booking.customer_email}`}>
          {booking.customer_email}
        </a>
        {booking.customer_phone ? ` · ${booking.customer_phone}` : ""}
      </p>
      {booking.note ? (
        <p className="mt-1 text-body text-ink-muted">
          <span className="font-medium text-ink">{t("booking.owner.noteFrom")}:</span> {booking.note}
        </p>
      ) : null}

      <p className="mt-3 text-meta font-medium text-ink-muted">{t("booking.owner.suggested")}</p>
      <ul className="mt-1 space-y-2">
        {booking.proposed_times.map((p) => {
          const choices = windowStyle ? arrivalChoices(p.starts_at, p.ends_at, booking.duration_minutes) : [];
          const chosen = arrival[p.id] ?? choices[0];
          return (
            <li key={p.id} className="flex flex-wrap items-end gap-2 rounded-input border border-line p-2">
              <span className="min-w-0 flex-1 text-body text-ink">
                {windowStyle && p.part_of_day
                  ? `${formatBookingDay(p.starts_at, zone, intl)}, ${t(`booking.parts.${p.part_of_day}`)}`
                  : formatBookingTime(p.starts_at, zone, intl)}
              </span>
              {windowStyle ? (
                <label className="block">
                  <span className="sr-only">{t("booking.owner.arrivalTime")}</span>
                  <select
                    value={chosen}
                    onChange={(e) => setArrival((c) => ({ ...c, [p.id]: e.target.value }))}
                    className={`${FIELD} h-9 w-auto pr-8`}
                    title={t("booking.owner.arrivalHint")}
                  >
                    {choices.map((iso) => (
                      <option key={iso} value={iso}>
                        {formatBookingClock(iso, zone, intl)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run("accept", { proposed_time_id: p.id, ...(windowStyle ? { start: chosen } : {}) })
                }
              >
                {t("booking.owner.accept")}
              </Button>
            </li>
          );
        })}
      </ul>

      {declining ? (
        <div className="mt-3 space-y-2 rounded-input border border-line-strong p-3">
          <h4 className="font-semibold text-ink">{t("booking.owner.declineTitle")}</h4>
          <label className="block">
            <span className={LABEL}>{t("booking.owner.declineLabel")}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("booking.owner.declinePlaceholder")}
              className={TEXTAREA}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy || !message.trim()}
              onClick={() => run("decline", { message: message.trim() })}
            >
              {busy ? t("booking.owner.working") : t("booking.owner.sendDecline")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDeclining(false)} disabled={busy}>
              {t("booking.owner.close")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setDeclining(true)}>
          {t("booking.owner.decline")}
        </Button>
      )}
      {error ? (
        <Alert className="mt-3" locale={locale}>
          {error}
        </Alert>
      ) : null}
    </Card>
  );
}

function OtherCard({
  businessId,
  booking,
  locale,
  onChange,
}: {
  businessId: number;
  booking: Booking;
  locale: Locale;
  onChange: (b: Booking) => void;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const zone = booking.timezone;
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = booking.status === "confirmed";
  const started = booking.confirmed_start ? new Date(booking.confirmed_start).getTime() <= Date.now() : false;

  async function run(action: BookingAction, body: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await post(businessId, booking.id, action, body);
    setBusy(false);
    if (result.ok) {
      onChange(result.booking);
      setCancelling(false);
    } else setError(result.message);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-card-title text-ink">{booking.service_name}</h3>
          <p className="text-meta text-ink-muted">
            {booking.customer_name} · {booking.customer_email}
            {booking.customer_phone ? ` · ${booking.customer_phone}` : ""}
          </p>
        </div>
        <Badge tone={TONES[booking.status]}>{t(`booking.status.${booking.status}`)}</Badge>
      </div>

      {confirmed && booking.confirmed_start ? (
        <p className="mt-2 text-body text-ink">
          <span className="font-medium">{t("booking.owner.confirmed")}</span>{" "}
          {formatBookingTime(booking.confirmed_start, zone, intl)}
        </p>
      ) : null}
      {booking.status === "cancelled" && booking.cancel_reason ? (
        <p className="mt-2 text-body text-ink-muted">{booking.cancel_reason}</p>
      ) : null}

      {confirmed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy || !started} onClick={() => run("complete", {})}>
            {t("booking.owner.markDone")}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !started} onClick={() => run("no-show", {})}>
            {t("booking.owner.markNoShow")}
          </Button>
          {!cancelling ? (
            <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
              {t("booking.owner.cancelBooking")}
            </Button>
          ) : null}
          {!started ? <p className={`${HINT} w-full`}>{t("booking.owner.notYet")}</p> : null}
        </div>
      ) : null}

      {cancelling ? (
        <div className="mt-3 space-y-2 rounded-input border border-line-strong p-3">
          <h4 className="font-semibold text-ink">{t("booking.owner.cancelTitle")}</h4>
          <label className="block">
            <span className={LABEL}>{t("booking.owner.cancelLabel")}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={TEXTAREA}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy || !reason.trim()}
              onClick={() => run("cancel", { reason: reason.trim() })}
            >
              {busy ? t("booking.owner.working") : t("booking.owner.sendCancel")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCancelling(false)} disabled={busy}>
              {t("booking.owner.close")}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <Alert className="mt-3" locale={locale}>
          {error}
        </Alert>
      ) : null}
    </Card>
  );
}

/* --------------------------------------------------------------- services */

function dollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function toCents(value: string): number | null | "bad" {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : "bad";
}

function ServiceRow({
  businessId,
  service,
  locale,
  onChange,
}: {
  businessId: number;
  service: BookableService;
  locale: Locale;
  onChange: (s: BookableService) => void;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [minutes, setMinutes] = useState(String(service.duration_minutes));
  const [price, setPrice] = useState(dollars(service.price_cents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/services/${businessId}/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("booking.mine.failed"),
        );
        return;
      }
      onChange(payload as BookableService);
      setEditing(false);
    } catch {
      setError(t("booking.mine.failed"));
    } finally {
      setBusy(false);
    }
  }

  function save(): void {
    const cents = toCents(price);
    const mins = Number(minutes);
    if (cents === "bad" || !Number.isInteger(mins) || mins < 5 || mins > 720 || !name.trim()) {
      setError(t("booking.mine.failed"));
      return;
    }
    void patch({ name: name.trim(), duration_minutes: mins, price_cents: cents });
  }

  if (editing) {
    return (
      <li className="space-y-2 rounded-input border border-line-strong p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className={LABEL}>{t("booking.services.name")}</span>
            <input className={FIELD} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>{t("booking.services.minutes")}</span>
            <input className={FIELD} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>{t("booking.services.price")}</span>
            <input className={FIELD} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <p className={HINT}>{t("booking.services.priceHint")}</p>
        {error ? <Alert locale={locale}>{error}</Alert> : null}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? t("booking.services.saving") : t("booking.services.save")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
            {t("booking.owner.close")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-input border border-line p-3">
      <div className="min-w-0 flex-1">
        <p className={service.is_active ? "font-medium text-ink" : "font-medium text-ink-subtle"}>
          {service.name}
          {!service.is_active ? <Badge className="ml-2">{t("booking.services.inactive")}</Badge> : null}
        </p>
        <p className="text-meta text-ink-muted">
          {t("booking.form.minutes", { minutes: service.duration_minutes })}
          {" · "}
          {formatPrice(service.price_cents, intl) ?? t("booking.form.priceOnRequest")}
        </p>
        {error ? <p className="text-meta text-danger">{error}</p> : null}
      </div>
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
        {t("booking.services.edit")}
      </Button>
      {service.is_active ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ is_active: false })}>
          {t("booking.services.remove")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ is_active: true })}>
          {t("booking.services.restore")}
        </Button>
      )}
    </li>
  );
}

function ServicesManager({
  businessId,
  initial,
  locale,
}: {
  businessId: number;
  initial: BookableService[];
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const [services, setServices] = useState(initial);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const cents = toCents(price);
    const mins = Number(minutes);
    if (cents === "bad" || !Number.isInteger(mins) || mins < 5 || mins > 720 || !name.trim()) {
      setError(t("booking.mine.failed"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/services/${businessId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), duration_minutes: mins, price_cents: cents }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("booking.mine.failed"),
        );
        return;
      }
      setServices((current) => [...current, payload as BookableService]);
      setName("");
      setPrice("");
    } catch {
      setError(t("booking.mine.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="services-heading" className="mt-8">
      <h2 id="services-heading" className="text-section-heading text-ink">
        {t("booking.services.title")}
      </h2>
      <p className="mt-1 text-body text-ink-muted">{t("booking.services.intro")}</p>

      {services.length === 0 ? (
        <p className="mt-3 text-body text-ink-muted">{t("booking.services.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              businessId={businessId}
              service={service}
              locale={locale}
              onChange={(next) => setServices((c) => c.map((s) => (s.id === next.id ? next : s)))}
            />
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 space-y-3 rounded-input border border-line p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className={LABEL}>{t("booking.services.name")}</span>
            <input className={FIELD} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>{t("booking.services.minutes")}</span>
            <input className={FIELD} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>{t("booking.services.price")}</span>
            <input className={FIELD} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <p className={HINT}>{t("booking.services.priceHint")}</p>
        {error ? <Alert locale={locale}>{error}</Alert> : null}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? t("booking.services.saving") : t("booking.services.add")}
        </Button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ main */

export default function OwnerBookings({
  businessId,
  initialBookings,
  initialServices,
  locale = "en",
}: {
  businessId: number;
  initialBookings: Booking[];
  initialServices: BookableService[];
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const [bookings, setBookings] = useState(initialBookings);
  const replace = (next: Booking): void =>
    setBookings((current) => current.map((b) => (b.id === next.id ? next : b)));

  const pending = bookings.filter((b) => b.status === "requested");
  const others = bookings.filter((b) => b.status !== "requested");

  return (
    <div>
      {bookings.length === 0 ? (
        <Card className="p-5">
          <p className="font-medium text-ink">{t("booking.owner.none")}</p>
          <p className="mt-1 text-body text-ink-muted">{t("booking.owner.noneHint")}</p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="text-section-heading text-ink">
            {t("booking.owner.pending")} ({pending.length})
          </h2>
          <div className="mt-3 space-y-3">
            {pending.map((b) => (
              <PendingCard key={b.id} businessId={businessId} booking={b} locale={locale} onChange={replace} />
            ))}
          </div>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section aria-labelledby="others-heading" className="mt-8">
          <h2 id="others-heading" className="text-section-heading text-ink">
            {t("booking.owner.others")}
          </h2>
          <div className="mt-3 space-y-3">
            {others.map((b) => (
              <OtherCard key={b.id} businessId={businessId} booking={b} locale={locale} onChange={replace} />
            ))}
          </div>
        </section>
      ) : null}

      <ServicesManager businessId={businessId} initial={initialServices} locale={locale} />
    </div>
  );
}
