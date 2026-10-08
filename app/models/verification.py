"""Business verification (KYC).

One row per listing, holding what the owner submitted to prove the business is
real - contact details, a trade licence, a GST/HST number - and a moderator's
decision on it.

Deliberately a separate table from `businesses` rather than more columns on it:

  - The documents are the sensitive part. Keeping them in their own table means
    the public listing query never selects a licence number by accident, and a
    future retention policy can drop this table without touching the directory.
  - Moderating a listing's *content* and verifying its *identity* are different
    decisions made at different times. A listing can be approved and unverified
    (a moderator liked the copy, nobody has checked the licence yet), or
    verified and suspended. Two statuses, two trails.

Both must be positive before the listing appears in public search - see
search_businesses() in app/api/v1/businesses.py.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class VerificationStatus(str, enum.Enum):
    """Where a KYC submission stands.

    Lowercase values to match business_status_enum and the rest of the
    directory's wire format; the frontends compare these strings directly.
    """

    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class BusinessVerification(Base):
    """The KYC record for one listing."""

    __tablename__ = "business_verifications"
    __table_args__ = (
        # The moderator queue reads pending, newest first.
        Index("ix_business_verifications_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # UNIQUE, not just indexed: one listing has exactly one verification record.
    # A resubmission after a rejection updates this row rather than adding a
    # second one, so "the current state" is never ambiguous.
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Contact details as given on the KYC form. These are what a reviewer calls
    # to check the business exists, and they are intentionally NOT copied from
    # businesses.phone/email: the public listing can say anything, this is what
    # the owner attested to.
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(32), nullable=False)

    # Trade licence. Nullable because not every trade is licensed - a
    # restaurant has a permit, a copywriter has neither - and rejecting an
    # honest submission for want of a number that does not exist is worse than
    # letting a reviewer judge.
    license_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    license_document_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # GST/HST registration. Optional for the same reason: businesses under the
    # small-supplier threshold are not required to register.
    gst_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gst_document_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status_enum", native_enum=True),
        nullable=False,
        default=VerificationStatus.pending,
        server_default=VerificationStatus.pending.value,
        index=True,
    )
    # Shown to the owner. A rejection they cannot understand is a dead end, and
    # they cannot fix what they were not told about.
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SET NULL: losing the reviewer's account must not erase the decision.
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    business: Mapped["Business"] = relationship(back_populates="verification")
    # foreign_keys is not needed here (only one FK points at users), but the
    # relationship is one-directional on purpose: a user does not "have"
    # verifications, they reviewed some.
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])

    def __repr__(self) -> str:
        return (
            f"<BusinessVerification id={self.id} business_id={self.business_id} "
            f"status={self.status.value}>"
        )
