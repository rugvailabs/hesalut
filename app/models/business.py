from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.business_review import BusinessReview
    from app.models.chat import Conversation
    from app.models.enquiry import Enquiry
    from app.models.subscription import Subscription
    from app.models.user import User
    from app.models.verification import BusinessVerification


class BusinessStatus(str, enum.Enum):
    """Moderation state of a listing.

    Only `approved` is publicly visible. This is separate from `is_active`,
    which is the owner's own on/off switch - a listing can be approved but
    paused, and that is not the same as pending review.
    """

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class Business(Base):
    """A listing in the public directory.

    Distinct from `providers`, which is the matching pool the submission
    pipeline routes problems to. That table has no address, coordinates or
    rating and is not meant to be browsed; conflating the two would couple the
    public directory to the pipeline's matching rules.
    """

    __tablename__ = "businesses"
    __table_args__ = (
        # Every list query filters on is_active, and most also order by rating.
        Index("ix_businesses_active_rating", "is_active", "rating"),
        # Public search filters status+is_active together on every request.
        Index("ix_businesses_status_active", "status", "is_active"),
        # "near me" scans a lat/lng bounding box before the exact distance sort.
        Index("ix_businesses_lat_lng", "latitude", "longitude"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Nullable: the seeded catalogue predates ownership and has no owner. A
    # NULL owner simply means nobody can edit it from the dashboard.
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[BusinessStatus] = mapped_column(
        Enum(BusinessStatus, name="business_status_enum", native_enum=True),
        nullable=False,
        default=BusinessStatus.pending,
        server_default=BusinessStatus.pending.value,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    province: Mapped[str] = mapped_column(String(2), nullable=False, server_default="ON")
    postal_code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Nullable because a listing can exist before it is geocoded; such rows are
    # simply excluded from radius searches rather than being sorted as if at 0,0.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Denormalised aggregate over business_reviews, recomputed on every review
    # write (see app/api/v1/business_reviews.py). Kept on the row because
    # search sorts and filters on it and will not tolerate a per-row subquery.
    #
    # NULL means "no ratings yet", which is not the same as 0.0 and must not be
    # filtered in by ?min_rating=0. Seeded listings carry placeholder values
    # until they receive their first real review, at which point the aggregate
    # takes over.
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # "$", "$$", "$$$", "$$$$" - free text rather than an enum so the scale can
    # change without a migration.
    price_range: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # JSONB rather than a join table: tags are only ever read as a whole list
    # with the listing, never queried across listings.
    tags: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # {"mon": [["09:00","17:00"]], ...}; a day absent or [] means closed.
    opening_hours: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Booking, phase 0: "none", or "external" with booking_url pointing at the
    # owner's own tool (Square, Fresha...). Enforced together by a CHECK.
    booking_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="none", server_default="none"
    )
    booking_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # IANA name, e.g. "America/Vancouver". NULL means "the province's usual
    # zone" (app/services/booking_rules.py); owners in split-zone provinces set it.
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cancellation_policy: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Cancelling inside this many hours of the start shows the policy first.
    cancellation_window_hours: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=24, server_default="24"
    )
    verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Moderation trail, mirroring review_queue's decided_by/reviewer_note.
    # The note is shown to the owner: a rejection they cannot understand is
    # just a dead end.
    moderation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    moderated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # SET NULL: losing the moderator's account must not erase the decision.
    moderated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    category: Mapped["Category"] = relationship(back_populates="businesses")
    # foreign_keys is required, not optional: businesses now has two FKs to
    # users (owner_id and moderated_by), so the join is ambiguous without it.
    # Omitting it fails at mapper-configuration time, which takes down every
    # query in the app - including login - not just this relationship.
    owner: Mapped["User | None"] = relationship(
        back_populates="businesses", foreign_keys=[owner_id]
    )
    # Leads die with the listing they were made against.
    enquiries: Mapped[list["Enquiry"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["BusinessReview"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    # One-to-one: a resubmission updates the existing KYC row rather than
    # adding a second one, so "the current state" is never ambiguous.
    verification: Mapped["BusinessVerification | None"] = relationship(
        back_populates="business", uselist=False, cascade="all, delete-orphan"
    )
    # Plural because a business can subscribe, cancel and subscribe again; the
    # history is worth keeping. Search reads the live one for placement order
    # (app/services/placement.py); paying never affects visibility.
    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Business id={self.id} slug={self.slug!r} city={self.city!r}>"
