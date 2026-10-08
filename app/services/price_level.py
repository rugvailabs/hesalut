"""The "$" to "$$$$" price level of a listing, worked out from its services.

Search filters and sorts on `businesses.price_range`, and few owners fill it in,
so a price filter used to have almost nothing to match. A business that lists
priced services now gets a level from them, kept on the same column so search
stays one indexed comparison rather than a per-row subquery.

Whose value it is is recorded in `businesses.price_range_source`:

    owner      the owner chose a level; services never overwrite it
    services   derived here, and recomputed whenever a service changes

The level is the *median* of the active services that have a price, so one
expensive extra does not move a salon from "$$" to "$$$$". Free services
(price 0) and "price on request" (no price) are left out: they say nothing
about what the business charges. No priced service means no level.

The bands are absolute dollars, not relative to the trade, because the filter
is one scale shared by every category. They are repeated in the SQL of
migration g2d5e8b1c4a7, which backfilled existing listings; change both
together.
"""

from __future__ import annotations

from statistics import median
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.booking import BookableService
from app.models.business import Business

#: Upper bounds in cents: below the first is "$", below the second "$$", and so on.
BANDS_CENTS: tuple[int, int, int] = (5_000, 15_000, 40_000)
LEVELS: tuple[str, str, str, str] = ("$", "$$", "$$$", "$$$$")

SOURCE_OWNER = "owner"
SOURCE_SERVICES = "services"


def level_for(prices_cents: Iterable[int | None]) -> str | None:
    """The level for these service prices, or None when none is a real price."""
    priced = [p for p in prices_cents if p is not None and p > 0]
    if not priced:
        return None
    typical = median(priced)
    for band, level in zip(BANDS_CENTS, LEVELS):
        if typical < band:
            return level
    return LEVELS[-1]


def refresh_price_range(db: Session, business: Business) -> str | None:
    """Re-derive the listing's level from its active services, unless the owner set one.

    Flushes nothing itself; the caller commits. Returns the level now stored.
    """
    if business.price_range_source == SOURCE_OWNER:
        return business.price_range
    prices = db.scalars(
        select(BookableService.price_cents).where(
            BookableService.business_id == business.id,
            BookableService.is_active.is_(True),
        )
    ).all()
    business.price_range = level_for(prices)
    return business.price_range
