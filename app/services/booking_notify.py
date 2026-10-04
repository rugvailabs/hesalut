"""Booking emails and the calendar (.ics) file.

Every function is best effort and meant to run as a background task after the
request has committed: a booking that was saved but whose email did not send is
a log line, not a failed booking (the mailer already behaves this way).

All text is plain, in English. Times are written in the business's own time
zone with the zone abbreviation, so a customer in another zone is not misled.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.models.booking import Booking
from app.models.business import Business
from app.services import booking_rules
from app.services.mailer import send_email

logger = logging.getLogger(__name__)


def _one_line(value: str) -> str:
    """Header values cannot contain line breaks; names come from user input."""
    return " ".join(value.split())


def _ics_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """RFC 5545: lines longer than 75 octets are folded with a leading space."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, current = [], b""
    for char in line:
        encoded = char.encode("utf-8")
        if len(current) + len(encoded) > (75 if not parts else 74):
            parts.append(current)
            current = b""
        current += encoded
    parts.append(current)
    return "\r\n ".join(part.decode("utf-8") for part in parts)


def _utc_stamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_ics(booking: Booking, business: Business) -> bytes:
    """A one-event calendar file for a confirmed booking. UTC, so no VTIMEZONE needed."""
    assert booking.confirmed_start is not None and booking.confirmed_end is not None
    location = ", ".join(
        part for part in (business.address, business.city, business.province) if part
    )
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//justforyou//bookings//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:booking-{booking.id}@justforyou.ca",
        f"DTSTAMP:{_utc_stamp(datetime.now(timezone.utc))}",
        f"DTSTART:{_utc_stamp(booking.confirmed_start)}",
        f"DTEND:{_utc_stamp(booking.confirmed_end)}",
        f"SUMMARY:{_ics_escape(booking.service_name + ' - ' + business.name)}",
        f"LOCATION:{_ics_escape(location)}",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return ("\r\n".join(_fold(line) for line in lines) + "\r\n").encode("utf-8")


def _zone(business: Business) -> ZoneInfo:
    return booking_rules.zone_for(business.timezone, business.province)


def when(value: datetime, business: Business) -> str:
    local = value.astimezone(_zone(business))
    return local.strftime("%A, %B %d, %Y at %I:%M %p %Z").replace(" 0", " ")


def _proposed_lines(booking: Booking, business: Business) -> str:
    out = []
    for proposed in booking.proposed_times:
        if proposed.part_of_day:
            day = proposed.starts_at.astimezone(_zone(business)).strftime("%A, %B %d")
            out.append(f"  - {day}, {proposed.part_of_day}")
        else:
            out.append(f"  - {when(proposed.starts_at, business)}")
    return "\n".join(out)


def _owner_address(business: Business) -> str | None:
    if business.email:
        return business.email
    owner = business.owner
    return owner.email if owner is not None else None


def _link(path: str) -> str:
    return get_settings().web_base_url.rstrip("/") + path


def request_received(booking: Booking, business: Business) -> None:
    send_email(
        to=booking.customer_email,
        subject=_one_line(f"Booking request sent to {business.name}"),
        body=(
            f"Hi {booking.customer_name},\n\n"
            f"Your request for {booking.service_name} at {business.name} has been sent. "
            "The business will confirm one of the times you suggested, or suggest another. "
            "If they do not reply within 48 hours the request expires.\n\n"
            f"Times you suggested:\n{_proposed_lines(booking, business)}\n\n"
            f"See your bookings: {_link('/account/bookings')}\n"
        ),
    )
    owner = _owner_address(business)
    if owner:
        note = f"\nNote from the customer: {booking.note}\n" if booking.note else ""
        send_email(
            to=owner,
            subject=_one_line(f"New booking request: {booking.service_name}"),
            body=(
                f"{booking.customer_name} asked to book {booking.service_name} at {business.name}.\n\n"
                f"Times they suggested:\n{_proposed_lines(booking, business)}\n{note}\n"
                f"Reply within 48 hours: {_link(f'/dashboard/{business.id}/bookings')}\n"
            ),
            reply_to=booking.customer_email,
        )


def confirmed(booking: Booking, business: Business) -> None:
    assert booking.confirmed_start is not None
    send_email(
        to=booking.customer_email,
        subject=_one_line(f"Booking confirmed: {booking.service_name} at {business.name}"),
        body=(
            f"Hi {booking.customer_name},\n\n"
            f"{business.name} confirmed your booking for {booking.service_name}:\n\n"
            f"  {when(booking.confirmed_start, business)}\n\n"
            "A calendar file is attached - open it to add the booking to your calendar.\n"
            + (f"\nCancellation policy: {business.cancellation_policy}\n" if business.cancellation_policy else "")
            + f"\nManage your booking: {_link('/account/bookings')}\n"
        ),
        reply_to=_owner_address(business),
        attachments=[("booking.ics", "text/calendar", build_ics(booking, business))],
    )


def declined(booking: Booking, business: Business) -> None:
    send_email(
        to=booking.customer_email,
        subject=_one_line(f"{business.name} could not take your booking request"),
        body=(
            f"Hi {booking.customer_name},\n\n"
            f"{business.name} was not able to take your request for {booking.service_name}.\n"
            + (f"\nTheir message: {booking.decline_message}\n" if booking.decline_message else "")
            + "\nYou can try another time or another business.\n"
        ),
        reply_to=_owner_address(business),
    )


def cancelled(booking: Booking, business: Business) -> None:
    assert booking.cancelled_by is not None
    reason = f"\nReason: {booking.cancel_reason}\n" if booking.cancel_reason else ""
    start = when(booking.confirmed_start, business) if booking.confirmed_start else "the requested time"
    if booking.cancelled_by == "owner":
        send_email(
            to=booking.customer_email,
            subject=_one_line(f"Booking cancelled by {business.name}"),
            body=(
                f"Hi {booking.customer_name},\n\n{business.name} cancelled your booking for "
                f"{booking.service_name} on {start}.\n{reason}"
            ),
            reply_to=_owner_address(business),
        )
    else:
        send_email(
            to=booking.customer_email,
            subject=_one_line(f"Booking cancelled: {booking.service_name} at {business.name}"),
            body=f"Hi {booking.customer_name},\n\nYour booking for {booking.service_name} on {start} was cancelled.\n",
        )
        owner = _owner_address(business)
        if owner:
            send_email(
                to=owner,
                subject=_one_line(f"Booking cancelled by {booking.customer_name}"),
                body=(
                    f"{booking.customer_name} cancelled their booking for {booking.service_name} "
                    f"on {start}.\n{reason}"
                ),
                reply_to=booking.customer_email,
            )
