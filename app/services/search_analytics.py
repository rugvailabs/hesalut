"""Search impressions: recording them, and what they add up to.

Recording happens after the response is sent (a FastAPI background task), so
logging a page of results never slows the search down, and a failure to log is
a warning in the log rather than a failed search.

The reports:
  tier_performance      impressions, clicks, CTR and average position per tier
  rotation_fairness     how evenly Monthly subscribers share the top three places
  top_performers        the listings people click most, relative to how often shown
  business_performance  one listing's numbers, for its owner
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import Date, case, cast, func, insert, select, update
from sqlalchemy.orm import Session

from app.models.business import Business
from app.models.search_impression import SearchImpression
from app.schemas.directory import BusinessListItem
from app.services import placement
from app.services.priority_search import SearchFilters

logger = logging.getLogger(__name__)

CLICK_ACTIONS = ("view", "call", "enquire")


def _rounded(value: float | None) -> float | None:
    """Two decimal places of a degree - about a kilometre."""
    return round(value, 2) if value is not None else None


def _joined(many: tuple[str, ...], one: str | None) -> str | None:
    """Several categories or cities, comma-joined to fit the 128-character column."""
    value = ",".join(many) or one
    return value[:128] if value else None


def record_impressions(
    session_factory: Callable[[], Session],
    *,
    search_id: uuid.UUID,
    filters: SearchFilters,
    items: list[BusinessListItem],
    user_id: int | None,
) -> None:
    """Write one row per result shown. Never raises."""
    if not items:
        return
    rows = [
        {
            "search_id": search_id,
            "business_id": item.id,
            "position": item.position,
            "tier": placement.Tier[item.subscription_tier].value,
            "in_rotation": item.in_rotation,
            "user_id": user_id,
            "query": filters.q,
            "category_slug": _joined(filters.category_slugs, filters.category_slug),
            "city": _joined(filters.cities, filters.city),
            "sort": filters.sort.value,
            "latitude": _rounded(filters.lat),
            "longitude": _rounded(filters.lng),
        }
        for item in items
    ]
    try:
        with session_factory() as db:
            db.execute(insert(SearchImpression), rows)
            db.commit()
    except Exception:  # noqa: BLE001 - analytics must never break search
        logger.warning("Could not record %d search impressions", len(rows), exc_info=True)


def record_click(db: Session, *, search_id: uuid.UUID, business_id: int, action: str) -> bool:
    """Mark the impression clicked. Only the first click counts; returns whether this was it."""
    result = db.execute(
        update(SearchImpression)
        .where(
            SearchImpression.search_id == search_id,
            SearchImpression.business_id == business_id,
            SearchImpression.clicked_at.is_(None),
        )
        .values(clicked_at=datetime.now(timezone.utc), click_action=action)
    )
    db.commit()
    return (result.rowcount or 0) > 0


def since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _ctr(clicks: int, impressions: int) -> float:
    return round(clicks / impressions, 4) if impressions else 0.0


_clicked = func.count(SearchImpression.clicked_at)


def tier_performance(db: Session, start: datetime) -> list[dict]:
    rows = db.execute(
        select(
            SearchImpression.tier,
            func.count().label("impressions"),
            _clicked.label("clicks"),
            func.avg(SearchImpression.position).label("avg_position"),
        )
        .where(SearchImpression.created_at >= start)
        .group_by(SearchImpression.tier)
        .order_by(SearchImpression.tier)
    ).all()
    return [
        {
            "tier": placement.Tier(row.tier).name,
            "impressions": row.impressions,
            "clicks": row.clicks,
            "ctr": _ctr(row.clicks, row.impressions),
            "avg_position": round(float(row.avg_position), 1),
        }
        for row in rows
    ]


def rotation_fairness(db: Session, start: datetime) -> dict:
    """Share of Monthly impressions spent in the top three, per subscriber.

    Rotation is fair when every Monthly subscriber's leader share is similar;
    `fairness` is the lowest share divided by the highest (1.0 = perfectly
    even). Only subscribers seen at least 10 times are compared, so one stray
    search does not decide the ratio.
    """
    rows = db.execute(
        select(
            SearchImpression.business_id,
            Business.name,
            func.count().label("impressions"),
            func.count().filter(SearchImpression.in_rotation.is_(True)).label("leader_impressions"),
            _clicked.label("clicks"),
        )
        .join(Business, Business.id == SearchImpression.business_id)
        .where(
            SearchImpression.created_at >= start,
            SearchImpression.tier == placement.Tier.monthly.value,
        )
        .group_by(SearchImpression.business_id, Business.name)
        .order_by(func.count().desc())
    ).all()
    subscribers = [
        {
            "business_id": row.business_id,
            "name": row.name,
            "impressions": row.impressions,
            "leader_impressions": row.leader_impressions,
            "leader_share": _ctr(row.leader_impressions, row.impressions),
            "clicks": row.clicks,
            "ctr": _ctr(row.clicks, row.impressions),
        }
        for row in rows
    ]
    compared = [s["leader_share"] for s in subscribers if s["impressions"] >= 10]
    fairness = round(min(compared) / max(compared), 3) if compared and max(compared) > 0 else None
    return {"subscribers": subscribers, "fairness": fairness, "compared": len(compared)}


def top_performers(db: Session, start: datetime, *, min_impressions: int = 20, limit: int = 10) -> list[dict]:
    rows = db.execute(
        select(
            SearchImpression.business_id,
            Business.name,
            func.min(SearchImpression.tier).label("best_tier"),
            func.count().label("impressions"),
            _clicked.label("clicks"),
        )
        .join(Business, Business.id == SearchImpression.business_id)
        .where(SearchImpression.created_at >= start)
        .group_by(SearchImpression.business_id, Business.name)
        .having(func.count() >= min_impressions)
        .order_by((_clicked * 1.0 / func.count()).desc(), func.count().desc())
        .limit(limit)
    ).all()
    return [
        {
            "business_id": row.business_id,
            "name": row.name,
            "tier": placement.Tier(row.best_tier).name,
            "impressions": row.impressions,
            "clicks": row.clicks,
            "ctr": _ctr(row.clicks, row.impressions),
        }
        for row in rows
    ]


def business_performance(db: Session, business_id: int, start: datetime, days: int) -> dict:
    where = (SearchImpression.business_id == business_id, SearchImpression.created_at >= start)
    totals = db.execute(
        select(
            func.count().label("impressions"),
            _clicked.label("clicks"),
            func.avg(SearchImpression.position).label("avg_position"),
            func.count().filter(SearchImpression.click_action == "view").label("views"),
            func.count().filter(SearchImpression.click_action == "call").label("calls"),
            func.count().filter(SearchImpression.click_action == "enquire").label("enquiries"),
        ).where(*where)
    ).one()
    day = cast(SearchImpression.created_at, Date)
    daily = db.execute(
        select(day.label("day"), func.count().label("impressions"), _clicked.label("clicks"))
        .where(*where)
        .group_by(day)
        .order_by(day)
    ).all()
    by_tier = db.execute(
        select(SearchImpression.tier, func.count().label("impressions"))
        .where(*where)
        .group_by(SearchImpression.tier)
    ).all()
    return {
        "business_id": business_id,
        "days": days,
        "impressions": totals.impressions,
        "clicks": totals.clicks,
        "ctr": _ctr(totals.clicks, totals.impressions),
        "avg_position": round(float(totals.avg_position), 1) if totals.avg_position is not None else None,
        "clicks_by_action": {"view": totals.views, "call": totals.calls, "enquire": totals.enquiries},
        "impressions_by_tier": {placement.Tier(row.tier).name: row.impressions for row in by_tier},
        "daily": [{"day": row.day, "impressions": row.impressions, "clicks": row.clicks} for row in daily],
    }
