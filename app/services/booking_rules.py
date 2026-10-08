"""The rules of booking requests: who may book what, and when.

Pure functions, no database. The API (app/api/v1/bookings.py) loads rows and
asks these questions, so each rule is testable on its own.

Two booking styles, chosen by the business's category and not by a setting:

    appointment   a service of a set length at an exact time (a 45-minute
                  haircut at 2:30 pm)
    window        a day and a rough part of it (Tuesday morning); the owner
                  fixes the arrival time when accepting

Categories that fit neither (restaurants, hotels, car rentals) cannot take
booking requests. They can still use the external booking link.

Times arrive as the customer sees them - a date plus a wall-clock time or a
part of the day, in the *business's* time zone - and leave as UTC instants.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

STYLE_BY_CATEGORY: dict[str, str] = {
    "dentists": "appointment",
    "salons": "appointment",
    "gyms": "appointment",
    "legal": "appointment",
    "it-support": "appointment",
    "auto-repair": "appointment",
    "plumbers": "window",
    "electricians": "window",
    "movers": "window",
}

#: Local wall-clock bounds of each part of the day, for visit windows.
PARTS_OF_DAY: dict[str, tuple[time, time]] = {
    "morning": (time(8, 0), time(12, 0)),
    "afternoon": (time(12, 0), time(17, 0)),
    "evening": (time(17, 0), time(21, 0)),
}

MAX_PROPOSED = 3
#: Earliest a request may start, from now - the business needs time to answer.
MIN_LEAD = timedelta(hours=2)
MAX_AHEAD = timedelta(days=60)
#: A request nobody answers within this long is treated as expired.
REQUEST_TTL = timedelta(hours=48)
#: A confirmed booking nobody marked is treated as completed after this long.
AUTO_COMPLETE_AFTER = timedelta(days=3)
#: Most requests one customer may have waiting on a single business.
MAX_PENDING_PER_BUSINESS = 3

PROVINCE_TIMEZONE: dict[str, str] = {
    "BC": "America/Vancouver",
    "AB": "America/Edmonton",
    "SK": "America/Regina",
    "MB": "America/Winnipeg",
    "ON": "America/Toronto",
    "QC": "America/Toronto",
    "NB": "America/Halifax",
    "NS": "America/Halifax",
    "PE": "America/Halifax",
    "NL": "America/St_Johns",
    "YT": "America/Whitehorse",
    "NT": "America/Yellowknife",
    "NU": "America/Iqaluit",
}
_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class BookingRuleError(ValueError):
    """A request that breaks a booking rule; the message is safe to show."""


def style_for(category_slug: str | None) -> str | None:
    """"appointment", "window", or None when the category cannot take requests."""
    return STYLE_BY_CATEGORY.get(category_slug or "")


def zone_for(timezone_name: str | None, province: str | None) -> ZoneInfo:
    """The business's own zone: its setting, else its province's usual one."""
    for name in (timezone_name, PROVINCE_TIMEZONE.get((province or "").upper())):
        if name:
            try:
                return ZoneInfo(name)
            except ZoneInfoNotFoundError:
                continue
    return ZoneInfo("America/Vancouver")


def is_valid_zone(name: str) -> bool:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def _hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def open_ranges(opening_hours: dict[str, Any] | None, day: date) -> list[tuple[time, time]] | None:
    """Opening ranges on `day`; None when the business lists no hours at all.

    None means "unknown, do not block"; an empty list means "closed that day".
    """
    if not isinstance(opening_hours, dict) or not opening_hours:
        return None
    ranges = opening_hours.get(_DAYS[day.weekday()]) or []
    result: list[tuple[time, time]] = []
    for item in ranges:
        try:
            result.append((_hhmm(item[0]), _hhmm(item[1])))
        except (ValueError, IndexError, TypeError):
            continue
    return result


def to_utc(day: date, wall: time, zone: ZoneInfo) -> datetime:
    """A local wall-clock time as a UTC instant, refusing clock-change gaps."""
    local = datetime.combine(day, wall, tzinfo=zone)
    instant = local.astimezone(timezone.utc)
    if instant.astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
        raise BookingRuleError("That time does not exist on that day (clocks change). Pick another.")
    return instant


@dataclass(frozen=True)
class Proposal:
    starts_at: datetime
    ends_at: datetime
    part_of_day: str | None


def build_proposal(
    *,
    style: str,
    day: date,
    wall: time | None,
    part: str | None,
    duration_minutes: int,
    opening_hours: dict[str, Any] | None,
    zone: ZoneInfo,
    now: datetime,
) -> Proposal:
    """Validate one suggested time and return it as UTC instants."""
    ranges = open_ranges(opening_hours, day)
    if ranges is not None and not ranges:
        raise BookingRuleError(f"The business is closed on {day.strftime('%A %B %d')}.")

    if style == "appointment":
        if wall is None:
            raise BookingRuleError("Choose a time.")
        starts = to_utc(day, wall, zone)
        end_wall = datetime.combine(day, wall) + timedelta(minutes=duration_minutes)
        ends = starts + timedelta(minutes=duration_minutes)
        if ranges is not None and not any(
            lo <= wall and end_wall.date() == day and end_wall.time() <= hi for lo, hi in ranges
        ):
            raise BookingRuleError("That time is outside the business's opening hours.")
        proposal = Proposal(starts, ends, None)
    else:
        if part not in PARTS_OF_DAY:
            raise BookingRuleError("Choose morning, afternoon or evening.")
        lo, hi = PARTS_OF_DAY[part]
        if ranges is not None and not any(rlo < hi and lo < rhi for rlo, rhi in ranges):
            raise BookingRuleError(f"The business is not open in the {part} that day.")
        proposal = Proposal(to_utc(day, lo, zone), to_utc(day, hi, zone), part)

    if proposal.starts_at < now + MIN_LEAD and not (
        style == "window" and proposal.ends_at > now + MIN_LEAD
    ):
        raise BookingRuleError("That time is too soon. Choose a later time.")
    if proposal.starts_at > now + MAX_AHEAD:
        raise BookingRuleError("That is too far ahead. Choose a date within 60 days.")
    return proposal


def check_proposals(proposals: list[Proposal]) -> None:
    if not 1 <= len(proposals) <= MAX_PROPOSED:
        raise BookingRuleError(f"Suggest between 1 and {MAX_PROPOSED} times.")
    if len({(p.starts_at, p.ends_at) for p in proposals}) != len(proposals):
        raise BookingRuleError("Each suggested time must be different.")


def accepted_slot(
    *,
    style: str,
    proposed_start: datetime,
    proposed_end: datetime,
    duration_minutes: int,
    chosen_start: datetime | None,
) -> tuple[datetime, datetime]:
    """The slot the owner confirms for a proposed time.

    An appointment is confirmed exactly as proposed. For a visit window the
    owner names the arrival time, which has to fall inside the window the
    customer offered.
    """
    if style == "appointment":
        return proposed_start, proposed_end
    start = chosen_start or proposed_start
    if not (proposed_start <= start < proposed_end):
        raise BookingRuleError("The arrival time must be inside the window the customer chose.")
    return start, start + timedelta(minutes=duration_minutes)
