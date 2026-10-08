"""Search with placement, click tracking, and placement analytics.

    GET  /search/nearby                          near-me search (lat/lng required)
    GET  /search/understand                      plain-language query -> filters
    POST /search/clicks                          a result was opened, called or enquired
    GET  /admin/search-analytics                 CTR per tier, rotation fairness, top performers
    GET  /businesses/{id}/search-performance     one listing's numbers, for its owner

GET /businesses/search (app/api/v1/businesses.py) is the general search; both
run through run_search() below, so they order, label and log identically.
"""

from __future__ import annotations

import math
import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, sessionmaker

from app.core.db import get_db
from app.core.deps import get_current_user, require_admin, require_owned_business
from app.core.rate_limit import rate_limit
from app.core.visibility import require_visible_business
from app.models.booking_link_click import BookingLinkClick
from app.models.business import Business
from app.models.user import User
from app.schemas.directory import BusinessSort, SearchResponse
from app.schemas.smart_search import UnderstandResponse
from app.schemas.search_analytics import (
    BusinessSearchPerformance,
    ClickIn,
    ClickRecorded,
    SearchAnalytics,
)
from app.services import query_understanding, search_analytics
from app.services.priority_search import SearchFilters, get_nearby_services_with_priority

router = APIRouter(tags=["search"])


def run_search(
    *,
    db: Session,
    filters: SearchFilters,
    background: BackgroundTasks,
    user: User | None,
    track: bool,
) -> SearchResponse:
    """Search, then log what was shown once the response has gone out."""
    result = get_nearby_services_with_priority(db, filters)

    search_id = None
    if track and result.items:
        search_id = uuid.uuid4()
        # The request's session is closed by the time a background task runs,
        # so the task gets its own - bound to the same engine, which is what
        # keeps tests writing to the test database.
        background.add_task(
            search_analytics.record_impressions,
            sessionmaker(bind=db.get_bind(), future=True),
            search_id=search_id,
            filters=filters,
            items=result.items,
            user_id=user.id if user is not None else None,
        )

    total, page_size, page = result.total, filters.page_size, filters.page
    total_pages = math.ceil(total / page_size) if total else 0
    return SearchResponse(
        items=result.items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1 and total > 0,
        search_id=search_id,
    )


@router.get("/search/nearby", response_model=SearchResponse)
def search_nearby(
    background: BackgroundTasks,
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    category: str | None = Query(default=None, max_length=128, description="Category slug"),
    q: str | None = Query(default=None, max_length=128),
    radius_km: float = Query(default=25, gt=0, le=500),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    sort: BusinessSort = Query(default=BusinessSort.relevance),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    track: bool = Query(default=True, description="Log the results shown for analytics"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SearchResponse:
    """Businesses near a point, Featured and Promoted first. Requires sign-in."""
    return run_search(
        db=db,
        filters=SearchFilters(
            q=q,
            category_slug=category,
            lat=lat,
            lng=lng,
            radius_km=radius_km,
            min_rating=min_rating,
            sort=sort,
            page=page,
            page_size=page_size,
        ),
        background=background,
        user=user,
        track=track,
    )


@router.get(
    "/search/understand",
    response_model=UnderstandResponse,
    dependencies=[Depends(rate_limit("understand", 30, 60))],
)
def understand_query(
    q: str = Query(min_length=1, max_length=300),
    lang: Literal["en", "fr"] = Query(default="en"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> UnderstandResponse:
    """Turn a plain-language search into filters for /businesses/search. Requires sign-in.

    Never fails for a normal query: when the AI step is unavailable, slow or
    unsure, the answer is source "keywords" and the client searches the text
    as typed. The client runs the actual search, so ranking and paid
    placement are exactly what they would be for the same filters chosen by
    hand.
    """
    return query_understanding.understand(db, q, lang)


@router.post("/search/clicks", response_model=ClickRecorded, status_code=status.HTTP_202_ACCEPTED)
def record_click(payload: ClickIn, db: Session = Depends(get_db)) -> ClickRecorded:
    """A result was opened, its number revealed, or an enquiry started.

    Public, because most searches are anonymous. Only the first click on an
    impression is kept, so replaying the request cannot inflate a listing's
    numbers beyond one click per time it was actually shown.
    """
    recorded = search_analytics.record_click(
        db, search_id=payload.search_id, business_id=payload.business_id, action=payload.action
    )
    return ClickRecorded(recorded=recorded)


@router.post(
    "/businesses/{business_id}/booking-clicks",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("booking-click", 30, 3600))],
)
def record_booking_click(business_id: int, db: Session = Depends(get_db)) -> None:
    """Someone pressed "Book online" on a listing's profile.

    Public, and only for a publicly visible listing that actually has an
    external booking link, so ids cannot be probed or the counter padded for
    listings without the button. Rate-limited per client.
    """
    business = require_visible_business(db, business_id)
    if business.booking_mode != "external":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    db.add(BookingLinkClick(business_id=business.id))
    db.commit()


@router.get("/admin/search-analytics", response_model=SearchAnalytics)
def admin_search_analytics(
    days: int = Query(default=30, ge=1, le=365),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SearchAnalytics:
    start = search_analytics.since(days)
    return SearchAnalytics(
        days=days,
        tiers=search_analytics.tier_performance(db, start),
        rotation=search_analytics.rotation_fairness(db, start),
        top_performers=search_analytics.top_performers(db, start),
    )


@router.get("/businesses/{business_id}/search-performance", response_model=BusinessSearchPerformance)
def business_search_performance(
    days: int = Query(default=30, ge=1, le=365),
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BusinessSearchPerformance:
    """How often the listing was shown in search, where, and how often chosen."""
    start = search_analytics.since(days)
    return BusinessSearchPerformance(
        **search_analytics.business_performance(db, business.id, start, days),
        booking_clicks=search_analytics.booking_clicks(db, business.id, start),
    )
