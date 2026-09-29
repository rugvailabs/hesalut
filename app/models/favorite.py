from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Favorite(Base):
    """A listing a signed-in user saved to come back to.

    One row per (user, listing), enforced by the composite primary key, so
    saving twice is a no-op rather than a duplicate. Private to the user: no
    route exposes who saved a listing, and nothing counts saves for ranking.

    CASCADE on both sides - a saved listing that is deleted, or an account that
    is closed, takes the bookmark with it. A listing that is merely hidden
    (paused, suspended, KYC lapsed) keeps the row but drops out of the list;
    see app/api/v1/favorites.py.
    """

    __tablename__ = "favorites"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<Favorite user={self.user_id} business={self.business_id}>"
