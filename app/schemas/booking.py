"""Request and response shapes for services and bookings."""

from __future__ import annotations

import datetime as dt
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.booking_rules import MAX_PROPOSED

PartOfDay = Literal["morning", "afternoon", "evening"]


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(value.split())
    return value or None


class ServiceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_fr: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    duration_minutes: int = Field(ge=5, le=720)
    # Whole cents. None = "price on request".
    price_cents: int | None = Field(default=None, ge=0, le=10_000_000)

    @field_validator("name")
    @classmethod
    def _tidy_name(cls, value: str) -> str:
        cleaned = _clean(value)
        if cleaned is None:
            raise ValueError("Name is required")
        return cleaned

    @field_validator("name_fr")
    @classmethod
    def _tidy_name_fr(cls, value: str | None) -> str | None:
        return _clean(value)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    # Send null (or blank) to remove the French name.
    name_fr: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    duration_minutes: int | None = Field(default=None, ge=5, le=720)
    price_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    is_active: bool | None = None

    @field_validator("name_fr")
    @classmethod
    def _tidy_name_fr(cls, value: str | None) -> str | None:
        return _clean(value)


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_fr: str | None = None
    description: str | None
    duration_minutes: int
    price_cents: int | None
    is_active: bool


class BookingInfo(BaseModel):
    """What the booking form needs, for a business that takes requests."""

    business_id: int
    style: Literal["appointment", "window"]
    timezone: str
    cancellation_policy: str | None
    cancellation_window_hours: int
    opening_hours: dict[str, Any] | None
    max_proposed: int = MAX_PROPOSED
    services: list[ServiceOut]


class ProposedIn(BaseModel):
    """A suggested time, as the customer sees it, in the business's time zone."""

    date: dt.date
    # Appointments: the start time. Visit windows: leave out and send `part`.
    time: dt.time | None = None
    part: PartOfDay | None = None


class BookingCreate(BaseModel):
    business_id: int = Field(gt=0)
    service_id: int = Field(gt=0)
    proposals: list[ProposedIn] = Field(min_length=1, max_length=MAX_PROPOSED)
    phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=1000)
    # The customer agreed their details may be shared with this business.
    consent_shared: bool

    @field_validator("consent_shared")
    @classmethod
    def _must_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("You must agree to share your details with the business")
        return value


class ProposedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    starts_at: datetime
    ends_at: datetime
    part_of_day: str | None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    business_name: str
    business_slug: str
    timezone: str
    service_id: int | None
    service_name: str
    service_name_fr: str | None = None
    duration_minutes: int
    price_cents: int | None
    status: str
    style: str
    customer_name: str
    customer_email: str
    customer_phone: str | None
    note: str | None
    proposed_times: list[ProposedOut]
    confirmed_start: datetime | None
    confirmed_end: datetime | None
    decline_message: str | None
    cancelled_by: str | None
    cancel_reason: str | None
    created_at: datetime
    responded_at: datetime | None
    # While a request is waiting: when it lapses if nobody answers.
    expires_at: datetime | None = None
    cancellation_policy: str | None = None
    # True when a confirmed booking is inside the business's cancellation window.
    inside_cancellation_window: bool = False


class AcceptIn(BaseModel):
    proposed_time_id: int
    # Visit windows only: the arrival time, inside the chosen window.
    start: datetime | None = None


class DeclineIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class AdminBookingPage(BaseModel):
    """One page of the admin list, with what the pager and the usage line need.

    The customer's note is never included here (it can hold health details),
    nor is a cancellation reason the customer typed.
    """

    items: list[BookingOut]
    total: int
    page: int
    page_size: int
    total_pages: int
    # Bookings per status across everything the other filters match, so the
    # status chips can show how many each would give.
    status_counts: dict[str, int]
    # How much booking is actually used.
    businesses_taking_requests: int
    requests_last_30_days: int
