"use client";

/**
 * The customer's bookings: what is waiting, what is confirmed, what is over.
 *
 * Cancelling opens a small inline panel (not a modal) that shows the
 * business's cancellation policy first. Inside the cancellation window it says
 * so, but never blocks: there are no fees until real payments exist.
 */

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { LABEL, TEXTAREA } from "@/components/ds/form";
import { Badge, Button, Card } from "@/components/ds/primitives";
import {
  formatBookingClock,
  formatBookingDay,
  formatBookingTime,
  formatPrice,
  serviceLabel,
} from "@/lib/booking-format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { Booking, BookingStatus } from "@/lib/types";

const TONES: Record<BookingStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  requested: "warning",
  confirmed: "success",
  declined: "danger",
  cancelled: "neutral",
  expired: "neutral",
  completed: "brand",
  no_show: "danger",
};

function BookingCard({
  booking,
  locale,
  onChange,
}: {
  booking: Booking;
  locale: Locale;
  onChange: (next: Booking) => void;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const zone = booking.timezone;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiting = booking.status === "requested";
  const confirmed = booking.status === "confirmed";
  const price = formatPrice(booking.price_cents, intl);

  async function cancel(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
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
      onChange(payload as Booking);
      setOpen(false);
    } catch {
      setError(t("booking.mine.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-card-title text-ink">
            <Link href={`/business/${booking.business_slug}`} className="hover:underline">
              {booking.business_name}
            </Link>
          </h2>
          <p className="text-meta text-ink-muted">
            {serviceLabel(booking.service_name, booking.service_name_fr, locale)} · {t("booking.form.minutes", { minutes: booking.duration_minutes })}
            {price ? ` · ${price}` : ""}
          </p>
        </div>
        <Badge tone={TONES[booking.status]}>{t(`booking.status.${booking.status}`)}</Badge>
      </div>

      {confirmed && booking.confirmed_start ? (
        <p className="mt-3 text-body text-ink">
          <span className="font-medium">{t("booking.mine.confirmedFor")}</span>{" "}
          {formatBookingTime(booking.confirmed_start, zone, intl)}
        </p>
      ) : null}

      {waiting ? (
        <div className="mt-3">
          <p className="text-meta font-medium text-ink-muted">{t("booking.mine.youSuggested")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body text-ink">
            {booking.proposed_times.map((p) => (
              <li key={p.id}>
                {p.part_of_day
                  ? `${formatBookingDay(p.starts_at, zone, intl)}, ${t(`booking.parts.${p.part_of_day}`)}`
                  : `${formatBookingDay(p.starts_at, zone, intl)} ${t("booking.mine.at")} ${formatBookingClock(p.starts_at, zone, intl)}`}
              </li>
            ))}
          </ul>
          {booking.expires_at ? (
            <p className="mt-2 text-meta text-ink-subtle">
              {t("booking.mine.replyBy", { when: formatBookingTime(booking.expires_at, zone, intl) })}
            </p>
          ) : null}
        </div>
      ) : null}

      {booking.status === "declined" && booking.decline_message ? (
        <p className="mt-3 text-body text-ink-muted">
          <span className="font-medium text-ink">{t("booking.mine.reasonTheirs")}:</span>{" "}
          {booking.decline_message}
        </p>
      ) : null}
      {booking.status === "expired" ? (
        <p className="mt-3 text-body text-ink-muted">{t("booking.mine.expiredHint")}</p>
      ) : null}
      {booking.status === "cancelled" ? (
        <p className="mt-3 text-body text-ink-muted">
          {booking.cancelled_by === "owner"
            ? t("booking.mine.cancelledByBusiness")
            : t("booking.mine.cancelledByYou")}
          {booking.cancel_reason ? ` ${t("booking.mine.reasonLabel")}: ${booking.cancel_reason}` : ""}
        </p>
      ) : null}
      {confirmed ? (
        <p className="mt-2 text-meta text-ink-subtle">{t("booking.mine.addToCalendar")}</p>
      ) : null}

      {(waiting || confirmed) && !open ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          {waiting ? t("booking.mine.withdraw") : t("booking.mine.cancel")}
        </Button>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-3 rounded-input border border-line-strong p-3">
          <h3 className="font-semibold text-ink">
            {waiting ? t("booking.mine.withdrawTitle") : t("booking.mine.cancelTitle")}
          </h3>
          {confirmed && booking.inside_cancellation_window ? (
            <Alert tone="warning" locale={locale}>
              {t("booking.mine.insideWindow")}
            </Alert>
          ) : null}
          {booking.cancellation_policy ? (
            <div>
              <p className="text-meta font-medium text-ink-muted">{t("booking.mine.policy")}</p>
              <p className="whitespace-pre-line text-body text-ink-muted">{booking.cancellation_policy}</p>
            </div>
          ) : null}
          <label className="block">
            <span className={LABEL}>{t("booking.mine.reasonOptional")}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={TEXTAREA}
            />
          </label>
          {error ? <Alert locale={locale}>{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={cancel} disabled={busy}>
              {busy ? t("booking.mine.working") : t("booking.mine.confirmCancel")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              {t("booking.mine.keep")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function MyBookings({
  initial,
  locale = "en",
}: {
  initial: Booking[];
  locale?: Locale;
}): JSX.Element {
  const [bookings, setBookings] = useState(initial);
  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          locale={locale}
          onChange={(next) =>
            setBookings((current) => current.map((b) => (b.id === next.id ? next : b)))
          }
        />
      ))}
    </div>
  );
}
