"""Clicks on a listing's external "Book online" button.

One row per click, kept separate from search_impressions: those are clicked at
most once per impression and only exist for people who arrived via search,
whereas the booking button lives on the profile page and is reached from
anywhere. Counted for the owner's performance numbers; nothing about the
visitor is stored.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class BookingLinkClick(Base):
    __tablename__ = "booking_link_clicks"
    __table_args__ = (Index("ix_booking_link_clicks_business_created", "business_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
