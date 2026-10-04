"""Search with paid placement (spec: PrioritySearchService).

    get_nearby_services_with_priority()   the whole search, one SQL statement
      group_by_tier()                     ORDER BY tier: Annual, Monthly, Basic, none
      apply_rotation_logic()              ORDER BY this half hour's Monthly leaders
      sort_within_tier()                  ORDER BY rating, distance, age (or the chosen sort)

The spec describes fetching every provider in the radius and grouping, rotating
and sorting them in application code. That is done in the database instead, as
ORDER BY terms of one statement: an in-memory version has to load every match
to return one page, which is slower (benchmarked in scripts/bench_search.py) and
makes page 2 depend on a list the server no longer holds. The rules themselves
- what a tier is, how the rotation turns - live in app/services/placement.py.

Edge cases, all by construction rather than special-casing:
  - no Annual subscribers: the tier is simply empty, Monthly leads
  - one to three Monthly subscribers: all of them are in the rotation's front
    three every window, so nothing visibly rotates
  - equal rating and distance: the older listing first, then the lower id
  - nothing in range: an empty result; the caller widens or suggests areas
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Float, String, and_, asc, case, desc, func, literal, null, or_, select, text
from sqlalchemy.orm import Session

from app.core.visibility import join_verification, public_visibility_filters
from app.models.business import Business
from app.models.category import Category
from app.schemas.directory import BusinessListItem, BusinessSort
from app.services import booking_rules, embeddings, placement

EARTH_RADIUS_KM = 6371.0088

# One degree of latitude is ~111 km everywhere; longitude shrinks with latitude.
KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LNG = 111.320

# The start of a Canadian postal code: A1A, A1A1, A1A1A or A1A1A1.
POSTAL_PREFIX = re.compile(r"[A-Za-z]\d[A-Za-z](\d([A-Za-z]\d?)?)?")


def _distance_km(lat: float, lng: float):
    """Great-circle distance from (lat, lng) to each row, in kilometres.

    Rounding can push the cosine term a hair outside [-1, 1], and acos() of
    1.0000000001 is a domain error in Postgres, so the argument is clamped.
    """
    cos_term = (
        func.cos(func.radians(lat))
        * func.cos(func.radians(Business.latitude))
        * func.cos(func.radians(Business.longitude) - func.radians(lng))
        + func.sin(func.radians(lat)) * func.sin(func.radians(Business.latitude))
    )
    clamped = func.least(1.0, func.greatest(-1.0, cos_term))
    return (EARTH_RADIUS_KM * func.acos(clamped)).cast(Float)


def _escape_like(value: str) -> str:
    """Neutralise LIKE wildcards so a literal % or _ cannot widen the search."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


#: Rating bands, [low, high). "5" is five stars exactly. Unrated listings are
#: in no band - "unrated" is not a low score.
RATING_BANDS: dict[str, tuple[float, float | None]] = {
    "5": (5.0, None),
    "4.5": (4.5, 5.0),
    "4": (4.0, 4.5),
    "3": (3.0, 4.0),
}

#: Hours requirements a search can ask for.
HOURS_OPTIONS = ("open_now", "weekends", "evenings")

# Opening hours are the business's local time. Every listing is in BC today;
# a per-listing time zone column is what would replace this constant.
LOCAL_TZ = ZoneInfo("America/Vancouver")
DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")  # datetime.weekday() order

# opening_hours is JSONB shaped {"mon": [["09:00", "17:00"], ...], ...}, but
# some rows hold JSON null. jsonb_each / jsonb_array_elements raise on the
# wrong type, so every access goes through these guards. "HH:MM" strings
# compare correctly as text, and a range whose end is before its start runs
# past midnight ("17:00"-"00:30").
_HOURS = (
    "(CASE WHEN jsonb_typeof(businesses.opening_hours) = 'object' "
    "THEN businesses.opening_hours ELSE '{}'::jsonb END)"
)


def _day_ranges(day_param: str) -> str:
    day = f"{_HOURS} -> :{day_param}"
    return f"jsonb_array_elements(CASE WHEN jsonb_typeof({day}) = 'array' THEN {day} ELSE '[]'::jsonb END)"


def is_bookable(booking_mode: str | None, category_slug: str | None) -> bool:
    """Whether a visitor can book this listing, for the badge.

    An external link always counts. Booking requests count only while the
    category still takes them: an owner who later moves to a category that
    does not (restaurants, hotels) has a booking page that answers 404, and
    must not be advertised as bookable. Mirrors `bookable_clause`.
    """
    if booking_mode == "external":
        return True
    return booking_mode == "request" and booking_rules.style_for(category_slug) is not None


def bookable_clause() -> Any:
    """SQL form of `is_bookable`, for the "Bookable" filter."""
    return or_(
        Business.booking_mode == "external",
        and_(
            Business.booking_mode == "request",
            Category.slug.in_(sorted(booking_rules.STYLE_BY_CATEGORY)),
        ),
    )


def _rating_band(band: str) -> Any:
    low, high = RATING_BANDS[band]
    clause = Business.rating >= low
    return clause if high is None else and_(clause, Business.rating < high)


def _hours_clause(requirement: str, moment: datetime) -> Any:
    """SQL for one hours requirement, evaluated at `moment` in local time."""
    if requirement == "weekends":
        return text(
            f"(jsonb_array_length(CASE WHEN jsonb_typeof({_HOURS} -> 'sat') = 'array' "
            f"THEN {_HOURS} -> 'sat' ELSE '[]'::jsonb END) > 0 "
            f"OR jsonb_array_length(CASE WHEN jsonb_typeof({_HOURS} -> 'sun') = 'array' "
            f"THEN {_HOURS} -> 'sun' ELSE '[]'::jsonb END) > 0)"
        )
    if requirement == "evenings":
        # Open at 8 pm or later on at least one day.
        return text(
            f"EXISTS (SELECT 1 FROM jsonb_each({_HOURS}) d, "
            "jsonb_array_elements(CASE WHEN jsonb_typeof(d.value) = 'array' "
            "THEN d.value ELSE '[]'::jsonb END) r "
            "WHERE r ->> 1 >= '20:00' OR r ->> 1 < r ->> 0)"
        )
    if requirement == "open_now":
        local = moment.astimezone(LOCAL_TZ)
        return text(
            f"(EXISTS (SELECT 1 FROM {_day_ranges('hours_today')} r "
            "WHERE r ->> 0 <= :hours_now AND (r ->> 1 > :hours_now OR r ->> 1 < r ->> 0)) "
            f"OR EXISTS (SELECT 1 FROM {_day_ranges('hours_yesterday')} r "
            "WHERE r ->> 1 < r ->> 0 AND :hours_now < r ->> 1))"
        ).bindparams(
            hours_today=DAY_KEYS[local.weekday()],
            hours_yesterday=DAY_KEYS[(local.weekday() - 1) % 7],
            hours_now=local.strftime("%H:%M"),
        )
    raise ValueError(f"Unknown hours requirement: {requirement}")


@dataclass(frozen=True)
class SearchFilters:
    q: str | None = None
    category_slug: str | None = None
    city: str | None = None
    # A postal code or its start ("V6B", "V6B 1A1"); matched ignoring spaces.
    postal_code: str | None = None
    lat: float | None = None
    lng: float | None = None
    radius_km: float | None = None
    min_rating: float | None = None
    sort: BusinessSort = BusinessSort.relevance
    page: int = 1
    page_size: int = 20
    # Multi-select facets. Within one facet the choices are alternatives (any
    # of these categories, any of these cities, any of these rating bands);
    # every hours requirement must hold. Empty means "not filtered".
    category_slugs: tuple[str, ...] = ()
    cities: tuple[str, ...] = ()
    rating_bands: tuple[str, ...] = ()
    hours: tuple[str, ...] = ()
    price_levels: tuple[str, ...] = ()
    # Only listings a visitor can book: requests on this site, or the
    # owner's own booking link. See `bookable_clause`.
    bookable: bool = False

    @property
    def has_point(self) -> bool:
        return self.lat is not None and self.lng is not None


@dataclass(frozen=True)
class PrioritySearchResult:
    items: list[BusinessListItem]
    total: int
    # The instant the ordering was computed for - which rotation window.
    moment: datetime


def group_by_tier(r: Any) -> list[Any]:
    """ORDER BY term: Annual (1), Monthly (2), Basic (3), no plan (4)."""
    return [asc(r.tier)]


def apply_rotation_logic(spotlight: Any) -> list[Any]:
    """ORDER BY term: inside Monthly, this half hour's three leaders first.

    `spotlight` is 0 for a leader and 1 otherwise; see
    placement.in_rotation_spotlight for how the three are chosen.
    """
    return [asc(spotlight)]


def sort_within_tier(
    r: Any, sort: BusinessSort, has_point: bool, by_meaning: bool = False
) -> list[Any]:
    """ORDER BY terms inside a tier (spec: sortByRatingAndDistance).

    Relevance - the default, and what "near me" uses - is rating, then
    distance, then the oldest listing first, so equal listings keep a stable
    order. An explicit sort replaces it inside each tier.

    `by_meaning`: the text search also matched listings by meaning
    (app/services/embeddings.py). Under relevance, listings that contain the
    words come first, then the closest meaning matches, then the usual order.
    """
    # NULLS LAST wherever rating is ordered on: in Postgres a DESC sort puts
    # NULLs first, which would lead the list with unrated listings.
    if sort is BusinessSort.rating:
        order = [desc(r.rating).nulls_last(), desc(r.review_count)]
    elif sort is BusinessSort.reviews:
        order = [desc(r.review_count), desc(r.rating).nulls_last()]
    elif sort is BusinessSort.distance:
        order = [asc(r.distance_km)]
    elif sort is BusinessSort.name:
        order = [asc(r.name)]
    elif sort is BusinessSort.newest:
        order = [desc(r.created_at)]
    elif sort is BusinessSort.price:
        # "$" < "$$" < ... by length; NULL (not stated) after every price.
        order = [asc(func.length(r.price_range)).nulls_last(), desc(r.rating).nulls_last()]
    else:
        # Relevance, within a tier: best rated first, then the closest when the
        # search has a point, then the longest-listed.
        order = []
        if by_meaning:
            order = [desc(r.word_match), desc(r.meaning_score).nulls_last()]
        order.append(desc(r.rating).nulls_last())
        if has_point:
            order.append(asc(r.distance_km))
        order.append(asc(r.created_at))
    return order


def get_nearby_services_with_priority(
    db: Session, filters: SearchFilters
) -> PrioritySearchResult:
    """Run a search, ordered by placement, and return one page of it."""
    search = filters
    q, category_slug, city = filters.q, filters.category_slug, filters.city
    postal_code = filters.postal_code
    lat, lng, radius_km = filters.lat, filters.lng, filters.radius_km
    min_rating, sort = filters.min_rating, filters.sort
    page, page_size = filters.page, filters.page_size
    has_point = filters.has_point

    distance = _distance_km(lat, lng) if has_point else None

    # active + approved + KYC-verified, defined once in app/core/visibility.py
    # and applied identically by every public route. The KYC clause needs the
    # join below: a listing that never submitted KYC has no row to test, and an
    # outer join would let it through on NULL.
    filters = list(public_visibility_filters())

    needle = _escape_like(q.strip()) if q else ""
    # Smart search layer 2: listings close in meaning to the text, with their
    # similarity. {} whenever semantic search is off or fails - then this is
    # exactly the keyword search it always was.
    meaning = embeddings.similar(db, q) if needle else {}
    word_match: Any = literal(True)
    if needle:
        pattern = f"%{needle}%"
        matches = [
            Business.name.ilike(pattern, escape="\\"),
            Business.description.ilike(pattern, escape="\\"),
            Business.city.ilike(pattern, escape="\\"),
            Business.address.ilike(pattern, escape="\\"),
            Category.name.ilike(pattern, escape="\\"),
        ]
        # A postal code is typed as "V6B 1A1", "v6b1a1" or just the area
        # ("V6B"), so compare with spaces removed on both sides, from the start.
        compact = "".join(needle.split())
        if POSTAL_PREFIX.fullmatch(compact):
            matches.append(
                func.replace(Business.postal_code, " ", "").ilike(
                    f"{compact}%", escape="\\"
                )
            )
        word_match = or_(*matches)
        filters.append(or_(word_match, Business.id.in_(sorted(meaning))) if meaning else word_match)

    slugs = {s for s in (category_slug, *search.category_slugs) if s}
    if slugs:
        filters.append(Category.slug.in_(sorted(slugs)))
    places = {c.strip().lower() for c in (city, *search.cities) if c and c.strip()}
    if places:
        filters.append(func.lower(Business.city).in_(sorted(places)))
    if search.rating_bands:
        filters.append(
            or_(*(_rating_band(band) for band in sorted(set(search.rating_bands))))
        )
    if search.price_levels:
        filters.append(Business.price_range.in_(sorted(set(search.price_levels))))
    if search.bookable:
        filters.append(bookable_clause())
    for requirement in sorted(set(search.hours)):
        filters.append(_hours_clause(requirement, placement.now_utc()))
    postal = "".join((postal_code or "").split())
    if postal:
        filters.append(
            func.replace(Business.postal_code, " ", "").ilike(
                f"{_escape_like(postal)}%", escape="\\"
            )
        )
    if min_rating is not None:
        # NULL rating means "unrated", which must not satisfy a minimum.
        filters.append(Business.rating.is_not(None))
        filters.append(Business.rating >= min_rating)

    if has_point:
        # Rows without coordinates cannot participate in a proximity search.
        filters.append(Business.latitude.is_not(None))
        filters.append(Business.longitude.is_not(None))
        if radius_km is not None:
            # Cheap bounding box first, so the lat/lng index can discard most
            # rows before the trigonometry runs on the survivors.
            dlat = radius_km / KM_PER_DEG_LAT
            dlng = radius_km / (
                KM_PER_DEG_LNG * max(math.cos(math.radians(lat)), 1e-6)
            )
            filters.append(Business.latitude.between(lat - dlat, lat + dlat))
            filters.append(Business.longitude.between(lng - dlng, lng + dlng))
            filters.append(distance <= radius_km)

    where = and_(*filters)

    # ---- one statement: filter once, tier, rank, count, page ----------------
    #
    #   matched  every listing this search matches, with its distance and its
    #            plan tier (looked up per listing through the subscriptions
    #            index, not by aggregating every subscription in the table)
    #   ranked   window functions over `matched`: the rotation order inside each
    #            tier, each tier's size and first position, and the total
    #   outer    tier, this half hour's Monthly rotation, the requested sort,
    #            then one page
    #
    # The total rides along as count(*) OVER (), so there is no second query
    # to count - except for a page past the end, which returns no rows to carry
    # it (see below).
    moment = placement.now_utc()
    tier = placement.tier_for(Business.id, moment)

    matched = (
        join_verification(
            select(
                Business.id,
                Business.name,
                Business.slug,
                Business.description,
                Business.address,
                Business.city,
                Business.province,
                Business.postal_code,
                Business.latitude,
                Business.longitude,
                Business.phone,
                Business.website,
                Business.rating,
                Business.review_count,
                Business.verified,
                Business.created_at,
                Business.price_range,
                Business.opening_hours,
                Business.booking_mode,
                Category.slug.label("category_slug"),
                Category.name.label("category_name"),
                (distance if has_point else null().cast(Float)).label("distance_km"),
                tier.label("tier"),
                word_match.label("word_match"),
                (
                    case(*((Business.id == bid, score) for bid, score in meaning.items()), else_=None)
                    if meaning
                    else null()
                ).cast(Float).label("meaning_score"),
            ).join(Category, Category.id == Business.category_id)
        )
        .where(where)
        .subquery("matched")
    )
    m = matched.c

    ranked = select(
        matched,
        # A fixed pseudo-random order per tier (a hash of the id), so the
        # Monthly rotation is fair among the subscribers actually in these
        # results, and nobody is first just for being oldest.
        func.row_number()
        .over(partition_by=m.tier, order_by=func.md5(func.cast(m.id, String)))
        .label("base_rank"),
        func.count().over(partition_by=m.tier).label("group_size"),
        # rank() over tier = 1 + the number of matches in better tiers, i.e. the
        # overall position of the first row of this tier.
        func.rank().over(order_by=m.tier).label("tier_start"),
        func.count().over().label("total_matches"),
    ).subquery("ranked")
    r = ranked.c

    spotlight = case(
        (
            and_(
                r.tier == placement.Tier.monthly.value,
                placement.in_rotation_spotlight(
                    r.base_rank, r.group_size, placement.rotation_offset(moment)
                ),
            ),
            0,
        ),
        else_=1,
    )

    order = sort_within_tier(r, sort, has_point, by_meaning=bool(meaning))

    # Tier leads every sort; inside Monthly, this window's rotation leads.
    # Deterministic tiebreak last: without it, equal-ranked rows can repeat on
    # one page and vanish from another.
    order = [*group_by_tier(r), *apply_rotation_logic(spotlight), *order, asc(r.id)]

    offset = (page - 1) * page_size
    rows = db.execute(
        select(ranked, spotlight.label("spotlight"))
        .order_by(*order)
        .offset(offset)
        .limit(page_size)
    ).mappings().all()

    if rows:
        total = rows[0]["total_matches"]
    elif page == 1:
        total = 0
    else:
        # Past the last page: no row came back to carry the total.
        total = (
            db.scalar(
                join_verification(
                    select(func.count(Business.id))
                    .select_from(Business)
                    .join(Category, Category.id == Business.category_id)
                )
                .where(where)
            )
            or 0
        )

    items: list[BusinessListItem] = []
    for index, row in enumerate(rows):
        position = offset + index + 1
        items.append(
            BusinessListItem(
                id=row["id"],
                name=row["name"],
                slug=row["slug"],
                category_slug=row["category_slug"],
                category_name=row["category_name"],
                description=row["description"],
                address=row["address"],
                city=row["city"],
                province=row["province"],
                postal_code=row["postal_code"],
                latitude=row["latitude"],
                longitude=row["longitude"],
                phone=row["phone"],
                website=row["website"],
                rating=row["rating"],
                review_count=row["review_count"],
                verified=row["verified"],
                price_range=row["price_range"],
                booking_mode=row["booking_mode"],
                bookable=is_bookable(row["booking_mode"], row["category_slug"]),
                opening_hours=row["opening_hours"] if isinstance(row["opening_hours"], dict) else None,
                created_at=row["created_at"],
                distance_km=round(row["distance_km"], 2) if has_point else None,
                position=position,
                in_rotation=row["spotlight"] == 0,
                **placement.label(row["tier"]),
                display_reason=placement.explain(
                    tier_value=row["tier"],
                    in_rotation=row["spotlight"] == 0,
                    position_in_tier=position - row["tier_start"] + 1,
                    tier_size=row["group_size"],
                    sort=sort.value,
                    has_point=has_point,
                ),
            )
        )

    return PrioritySearchResult(items=items, total=total, moment=moment)
