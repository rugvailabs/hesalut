"""Paid placement in search: which subscription tier a listing is in.

Search orders every result set by tier before anything else:

    1  annual    Annual subscribers              badge ⭐ Featured
    2  monthly   Monthly subscribers, rotating   badge 📈 Promoted
    3  basic     the free Basic plan
    4  none      no active subscription

Placement changes ORDER, never VISIBILITY. Whether a listing appears at all is
still decided by moderation and verification alone (app/core/visibility.py);
a business that pays nothing is still found, just further down. Paid tiers are
labelled on every result card, because in Canada a ranking bought with money
has to be disclosed as such.

A subscription counts while it is `active` and its paid period has not ended.
Basic has no period end, so it counts for as long as it is active. A listing
with more than one live subscription gets its best tier.

MONTHLY ROTATION. Monthly subscribers are ranked against each other in a fixed
pseudo-random order (a hash of the listing id, so no one is permanently first
by being oldest), and every 30 minutes that order rotates by three places: the
three at the front of the Monthly group change each window, and over enough
windows every Monthly subscriber has its turn. It is computed from the clock
alone - the same query in the same window gives the same page to everyone, and
there is no state to store or expire.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import case, func, or_, select
from sqlalchemy.sql import ColumnElement

from app.models.subscription import BillingCycle, Plan, Subscription, SubscriptionStatus

ROTATION_WINDOW_SECONDS = 30 * 60
ROTATION_SLOTS = 3


class Tier(int, enum.Enum):
    annual = 1
    monthly = 2
    basic = 3
    none = 4


# What a result card shows, per tier: (icon, badge text, label).
BADGES: dict[Tier, tuple[str, str, str] | None] = {
    Tier.annual: ("⭐", "⭐ Featured", "Featured Business"),
    Tier.monthly: ("📈", "📈 Promoted", "Promoted Business"),
    Tier.basic: None,
    Tier.none: None,
}


def now_utc() -> datetime:
    """The clock placement runs on. A function so tests can pin it."""
    return datetime.now(timezone.utc)


def rotation_cycle(moment: datetime) -> int:
    """Which 30-minute window `moment` falls in, counted from the epoch."""
    return int(moment.timestamp()) // ROTATION_WINDOW_SECONDS


def tier_for(business_id: ColumnElement, moment: datetime) -> ColumnElement:
    """The listing's best live tier, 1-4, as a correlated scalar subquery.

    Correlated rather than a join against an aggregate of every subscription:
    it runs once per matched listing and reaches that listing's subscriptions
    through ix_subscriptions_business_status, so its cost follows the size of
    the result set, not of the subscriptions table.
    """
    live_tier = (
        select(
            func.min(
                case(
                    (Plan.amount <= 0, Tier.basic.value),
                    (Plan.billing_cycle == BillingCycle.yearly, Tier.annual.value),
                    else_=Tier.monthly.value,
                )
            )
        )
        .select_from(Subscription)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(
            Subscription.business_id == business_id,
            Subscription.status == SubscriptionStatus.active,
            or_(
                Subscription.current_period_end.is_(None),
                Subscription.current_period_end > moment,
            ),
        )
        .scalar_subquery()
    )
    return func.coalesce(live_tier, Tier.none.value)


def rotation_offset(moment: datetime) -> int:
    return rotation_cycle(moment) * ROTATION_SLOTS


def in_rotation_spotlight(
    base_rank: ColumnElement, group_size: ColumnElement, offset: int
) -> ColumnElement:
    """True for the ROTATION_SLOTS rows at the front of the group this window.

    `base_rank` is 1-based within the group. Postgres `%` keeps the sign of the
    dividend, so the double mod brings a negative position back into range.
    """
    position = func.mod(func.mod(base_rank - 1 - offset, group_size) + group_size, group_size)
    return position < ROTATION_SLOTS


def label(tier_value: int) -> dict[str, object]:
    """The placement fields a search result carries."""
    tier = Tier(tier_value)
    badge = BADGES[tier]
    return {
        "subscription_tier": tier.name,
        "is_featured": tier is Tier.annual,
        "featured_badge": badge[0] if badge else None,
        "badge": badge[1] if badge else None,
        "badge_label": badge[2] if badge else None,
        "display_priority": tier.value if tier is not Tier.none else None,
    }


_TIER_REASON = {
    Tier.annual: "Annual subscriber (Featured)",
    Tier.basic: "Basic plan",
    Tier.none: "No subscription, listed after subscribers",
}

_FIRST = {
    "relevance": "highest rated",
    "rating": "highest rated",
    "reviews": "most reviewed",
    "distance": "closest",
    "name": "first by name",
    "newest": "newest",
    "price": "lowest priced",
}


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def explain(
    *,
    tier_value: int,
    in_rotation: bool,
    position_in_tier: int,
    tier_size: int,
    sort: str,
    has_point: bool,
) -> str:
    """Why a result sits where it does: its tier, then its place inside it.

    "Annual subscriber (Featured), highest rated"
    "Monthly subscriber (Promoted), in this half hour's rotation, 2nd of 3 by rating"
    "No subscription, listed after subscribers, 4th of 12 by rating, then distance"
    """
    tier = Tier(tier_value)
    by = {
        "relevance": "by rating, then distance" if has_point else "by rating",
        "rating": "by rating",
        "reviews": "by number of reviews",
        "distance": "by distance",
        "name": "by name",
        "newest": "newest first",
        "price": "by price",
    }[sort]

    # Inside Monthly, the rotation's leaders and the rest are ranked separately.
    position, group = position_in_tier, tier_size
    if tier is Tier.monthly:
        leaders = min(ROTATION_SLOTS, tier_size)
        if in_rotation:
            reason, group = "Monthly subscriber (Promoted), in this half hour's rotation", leaders
        else:
            reason = "Monthly subscriber (Promoted), after this half hour's rotation"
            position, group = position_in_tier - leaders, tier_size - leaders
    else:
        reason = _TIER_REASON[tier]

    if group <= 1:
        return f"{reason}, the only one in this group"
    if position == 1:
        return f"{reason}, {_FIRST[sort]}"
    return f"{reason}, {_ordinal(position)} of {group} {by}"
