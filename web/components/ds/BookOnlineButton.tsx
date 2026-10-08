"use client";

/**
 * "Book online" - opens the owner's own booking page (Square, Fresha, ...).
 *
 * A real link, so middle-click, copy-address and no-JS all work; the click is
 * counted on the side, fire-and-forget, so a lost count never blocks the
 * visitor. The beacon goes through our own route because the API has no CORS.
 */

import { CalendarCheck } from "lucide-react";

import { Button } from "@/components/ds/primitives";

function trackBookingClick(businessId: number): void {
  try {
    const body = JSON.stringify({ business_id: businessId });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/booking-clicks", blob)) return;
    void fetch("/api/booking-clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never get in the way of the click itself.
  }
}

export default function BookOnlineButton({
  businessId,
  href,
  label,
  hint,
}: {
  businessId: number;
  href: string;
  label: string;
  hint: string;
}): JSX.Element {
  return (
    <Button asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={() => trackBookingClick(businessId)}
      >
        <CalendarCheck aria-hidden="true" />
        {label}
        <span className="sr-only"> ({hint})</span>
      </a>
    </Button>
  );
}
