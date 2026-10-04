"""Bookings (phase 1: booking requests) and the services a business offers.

A customer asks for a service and proposes up to three times; the business
accepts one or declines. Times are stored as timestamptz (UTC); the business's
own time zone is only used to interpret opening hours and to display.

The no-double-booking rule is a database constraint, not application code: two
*confirmed* bookings for the same business (and staff member, once staff
calendars exist) may not overlap. Application checks are a courtesy that gives
a friendly error; the constraint is what actually holds under concurrency.

Customer name, email, phone and the service's name, length and price are copied
onto the booking, so a later edit to the account or the service never rewrites
history.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy import CheckConstraint
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BookingStatus(str, enum.Enum):
    requested = "requested"
    confirmed = "confirmed"
    declined = "declined"
    cancelled = "cancelled"
    expired = "expired"
    completed = "completed"
    no_show = "no_show"


class BookableService(Base):
    """Something a business offers and can be booked for."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # NULL means "price on request"; zero would mean free, which is different.
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Soft delete: bookings keep pointing at a service that is no longer offered.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        ExcludeConstraint(
            ("business_id", "="),
            ("staff_key", "="),
            (text("tstzrange(confirmed_start, confirmed_end)"), "&&"),
            name="ex_bookings_no_overlap",
            using="gist",
            where=text("status = 'confirmed'"),
        ),
        CheckConstraint(
            "status <> 'confirmed' OR (confirmed_start IS NOT NULL AND confirmed_end > confirmed_start)",
            name="ck_bookings_confirmed_has_time",
        ),
        Index("ix_bookings_business_status", "business_id", "status"),
        Index("ix_bookings_customer", "customer_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Staff calendars arrive in a later phase. 0 means "the business itself";
    # a real staff id then keeps two people's calendars independent without
    # changing the constraint.
    staff_key: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=BookingStatus.requested.value,
        server_default=BookingStatus.requested.value,
    )
    # "appointment" (an exact time) or "window" (a day and part of the day).
    style: Mapped[str] = mapped_column(String(16), nullable=False)

    service_name: Mapped[str] = mapped_column(String(120), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_email: Mapped[str] = mapped_column(String(320), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # The customer agreed their details may be shared with this business.
    consent_shared: Mapped[bool] = mapped_column(Boolean, nullable=False)

    confirmed_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    confirmed_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decline_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    proposed_times: Mapped[list["BookingProposedTime"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="BookingProposedTime.starts_at",
        lazy="selectin",
    )


class BookingProposedTime(Base):
    """One of the (up to three) times a customer offered.

    For an appointment, starts_at/ends_at is the exact slot. For a visit
    window, it is the whole part of the day (for example 08:00-12:00) and the
    owner picks the arrival time inside it when accepting.
    """

    __tablename__ = "booking_proposed_times"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # "morning" | "afternoon" | "evening" for visit windows, else NULL.
    part_of_day: Mapped[str | None] = mapped_column(String(16), nullable=True)

    booking: Mapped[Booking] = relationship(back_populates="proposed_times")
