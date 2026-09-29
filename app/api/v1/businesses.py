"""Public business search for the directory.

Results are ordered by subscription tier first - Annual, then Monthly (rotating),
then Basic, then listings with no plan - and by the requested sort within each
tier. Tiers change the order only; what is visible at all is decided by
moderation and verification. The query is app/services/priority_search.py and
the rules app/services/placement.py; each page shown is logged for analytics
(app/api/v1/search.py).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v1.search import run_search
from app.core.db import get_db
from app.core.deps import get_current_user_optional
from app.core.visibility import visible_businesses
from app.models.business import Business
from app.models.user import User
from app.schemas.directory import BusinessSort, CityCount, SearchResponse
from app.services.priority_search import SearchFilters

router = APIRouter(prefix="/businesses", tags=["directory"])

RatingBand = Literal["5", "4.5", "4", "3"]
HoursOption = Literal["open_now", "weekends", "evenings"]
PriceLevel = Literal["$", "$$", "$$$", "$$$$"]


def _distinct(values: list[str] | None) -> tuple[str, ...]:
    """Trimmed, blank-free, first-seen order. Each value is capped like the old single param."""
    seen: dict[str, None] = {}
    for value in values or ():
        value = value.strip()
        if not value:
            continue
        if len(value) > 128:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A category or city is at most 128 characters.",
            )
        seen.setdefault(value, None)
    if len(seen) > 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Too many values for one filter (50 at most).",
        )
    return tuple(seen)


@router.get("/search", response_model=SearchResponse)
def search_businesses(
    background: BackgroundTasks,
    q: str | None = Query(default=None, max_length=128, description="Free text"),
    category_slug: list[str] | None = Query(
        default=None, description="Repeat for any of several categories"
    ),
    city: list[str] | None = Query(default=None, description="Repeat for any of several cities"),
    postal_code: str | None = Query(
        default=None,
        max_length=16,
        description="A postal code or its start (V6B, V6B 1A1); spaces ignored",
    ),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, gt=0, le=500),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    rating_band: list[RatingBand] | None = Query(
        default=None,
        description="Repeat for any of several bands: 5, 4.5 (4.5-4.99), 4 (4-4.49), 3 (3-3.99)",
    ),
    hours: list[HoursOption] | None = Query(
        default=None,
        description="Repeat to require each: open_now, weekends, evenings (open at 8 pm or later)",
    ),
    price: list[PriceLevel] | None = Query(
        default=None, description="Repeat for any of several price levels: $, $$, $$$, $$$$"
    ),
    sort: BusinessSort = Query(default=BusinessSort.relevance),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    track: bool = Query(
        default=True,
        description="Log the results shown for analytics. False for internal lookups nobody sees.",
    ),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> SearchResponse:
    """Search active listings. Public - no authentication required."""
    has_point = lat is not None and lng is not None
    slugs = _distinct(category_slug)
    cities = _distinct(city)

    # Fail loudly rather than silently ignoring a geo filter the caller meant.
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="lat and lng must be supplied together.",
        )
    if radius_km is not None and not has_point:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="radius_km requires both lat and lng.",
        )
    if sort is BusinessSort.distance and not has_point:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort=distance requires both lat and lng.",
        )

    return run_search(
        db=db,
        filters=SearchFilters(
            q=q,
            category_slug=slugs[0] if len(slugs) == 1 else None,
            category_slugs=slugs,
            city=cities[0] if len(cities) == 1 else None,
            cities=cities,
            rating_bands=tuple(rating_band or ()),
            hours=tuple(hours or ()),
            price_levels=tuple(price or ()),
            postal_code=postal_code,
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


@router.get("/cities", response_model=list[CityCount])
def list_cities(db: Session = Depends(get_db)) -> list[CityCount]:
    """Cities with at least one public listing, busiest first. For typeahead."""
    rows = db.execute(
        visible_businesses(
            Business.city, Business.province, func.count(Business.id).label("n")
        )
        .group_by(Business.city, Business.province)
        .order_by(func.count(Business.id).desc(), Business.city)
    ).all()
    return [
        CityCount(city=city, province=province, business_count=n)
        for city, province, n in rows
    ]
