"""Owner-facing listing management.

Split from businesses.py so the public search surface and the authenticated
owner surface stay visibly separate - it should be obvious at a glance which
routes are reachable without a token.

ROUTE ORDER MATTERS. FastAPI matches in declaration order, so the literal
paths here ("/owner/mine", "/by-slug/{slug}") must be registered before the
parameterised "/{business_id}" or "owner" gets parsed as a business id and
422s instead of routing.
"""

from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.db import get_db
from app.core.deps import (
    get_current_user,
    require_business_owner,
    require_owned_business,
)
from app.core.visibility import require_visible_business_by_slug
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.user import User, UserRole
from app.schemas.directory import (
    BusinessCreate,
    BusinessDetail,
    BusinessOwnerItem,
    BusinessUpdate,
)
from app.services import embeddings, price_level

router = APIRouter(prefix="/businesses", tags=["directory"])

MAX_SLUG_LENGTH = 255


def _slugify(value: str) -> str:
    """Lowercase ASCII slug. Accents are folded rather than dropped, so
    "Café Lumière" becomes "cafe-lumiere" and not "caf-lumire"."""
    folded = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")
    return slug[:MAX_SLUG_LENGTH] or "listing"


def _unique_slug(db: Session, base: str) -> str:
    """Append -2, -3 … until the slug is free.

    Slugs are the public URL key and are UNIQUE in the database, so two
    listings called "Toronto Plumbing" must not collide on insert.
    """
    slug = base
    suffix = 2
    while db.scalar(select(Business.id).where(Business.slug == slug)) is not None:
        # Keep room for the suffix rather than overflowing the column.
        trimmed = base[: MAX_SLUG_LENGTH - len(str(suffix)) - 1]
        slug = f"{trimmed}-{suffix}"
        suffix += 1
    return slug


def _detail(db: Session, business: Business) -> BusinessDetail:
    """Serialise a listing, resolving the category for display."""
    detail = BusinessDetail.model_validate(business)
    category = db.get(Category, business.category_id)
    if category is not None:
        detail.category_slug = category.slug
        detail.category_name = category.name
    return detail


@router.get("/owner/mine", response_model=list[BusinessOwnerItem])
def list_my_businesses(
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> list[Business]:
    """Every listing owned by the caller, newest first, whatever its status."""
    return list(
        db.scalars(
            select(Business)
            .where(Business.owner_id == current_user.id)
            .order_by(Business.created_at.desc(), Business.id.desc())
        ).all()
    )


@router.get("/by-slug/{slug}", response_model=BusinessDetail)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)) -> BusinessDetail:
    """Public listing detail.

    The same three gates as search - active, approved, KYC-verified - because
    this is the URL a search result links to. Excluding a listing from every
    list while leaving it fully readable to anyone who has or guesses its slug
    is not a gate, it is an inconvenience.
    """
    return _detail(db, require_visible_business_by_slug(db, slug))


def _require_booking_link(mode: str | None, url: str | None) -> None:
    if mode == "external" and not url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add your booking link, or turn online booking off",
        )


def _require_request_ready(db: Session, business: Business) -> None:
    """Booking requests need a category that books and at least one service."""
    from app.models.booking import BookableService
    from app.services import booking_rules
    from sqlalchemy import func

    slug = db.scalar(select(Category.slug).where(Category.id == business.category_id))
    if booking_rules.style_for(slug) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Booking requests are not available for this category yet. "
            "Use a link to your own booking page instead.",
        )
    active = db.scalar(
        select(func.count())
        .select_from(BookableService)
        .where(BookableService.business_id == business.id, BookableService.is_active.is_(True))
    )
    if not active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add at least one service before turning on booking requests",
        )


@router.post("", response_model=BusinessDetail, status_code=status.HTTP_201_CREATED)
def create_business(
    payload: BusinessCreate,
    background: BackgroundTasks,
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> BusinessDetail:
    """Create a listing owned by the caller, pending moderation."""
    if db.get(Category, payload.category_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown category",
        )

    data = payload.model_dump()
    # A level the owner typed is theirs; blank leaves it to be derived from
    # services (there are none yet on a new listing, so it starts empty).
    data["price_range"] = data.get("price_range") or None
    data["price_range_source"] = "owner" if data["price_range"] else "services"
    # HttpUrl is not a str as far as SQLAlchemy is concerned.
    website = data.pop("website", None)

    if data.get("booking_mode") == "request":
        # A brand-new listing has no services yet; add them, then switch on.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Create the listing and add a service before turning on booking requests",
        )
    _require_booking_link(data.get("booking_mode"), data.get("booking_url"))
    if data.get("booking_mode") != "external":
        data["booking_url"] = None

    business = Business(
        **data,
        website=str(website) if website is not None else None,
        slug=_unique_slug(db, _slugify(payload.name)),
        owner_id=current_user.id,
        # Server-assigned. A client-supplied status would be self-approval.
        status=BusinessStatus.pending,
        is_active=True,
        verified=False,
        rating=None,
        review_count=0,
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    # Keep the listing findable by meaning (smart search layer 2); a no-op
    # when semantic search is off.
    background.add_task(
        embeddings.sync_in_background, sessionmaker(bind=db.get_bind(), future=True), business.id
    )
    return _detail(db, business)


@router.get("/{business_id}", response_model=BusinessDetail)
def get_my_business(
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BusinessDetail:
    """Listing detail for the edit form. Ownership enforced by the dependency."""
    return _detail(db, business)


@router.patch("/{business_id}", response_model=BusinessDetail)
def update_business(
    payload: BusinessUpdate,
    background: BackgroundTasks,
    business: Business = Depends(require_owned_business),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessDetail:
    """Partial update of a listing the caller owns."""
    # exclude_unset so an omitted field is left alone, while an explicit null
    # genuinely clears it.
    updates = payload.model_dump(exclude_unset=True)

    if "category_id" in updates and updates["category_id"] is not None:
        if db.get(Category, updates["category_id"]) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unknown category",
            )

    if "website" in updates and updates["website"] is not None:
        updates["website"] = str(updates["website"])

    if "booking_mode" in updates or "booking_url" in updates:
        mode = updates.get("booking_mode", business.booking_mode)
        # Leaving "none" clears the link so a stale URL cannot linger.
        url = None if mode == "none" else updates.get("booking_url", business.booking_url)
        _require_booking_link(mode, url)
        if mode == "request" and business.booking_mode != "request":
            _require_request_ready(db, business)
        updates["booking_mode"], updates["booking_url"] = mode, (url if mode == "external" else None)

    # Editing a live listing sends it back for re-approval, so an owner cannot
    # get something approved and then swap its content. Admins are exempt.
    is_admin = current_user.is_admin or current_user.role is UserRole.admin
    # Switching booking on or off, and the time zone and cancellation window,
    # say nothing a visitor could be misled by, so they do not unlist the
    # listing. An external link and the public policy text still do.
    not_content = {"is_active", "timezone", "cancellation_window_hours"}
    if updates.get("booking_mode") != "external":
        not_content |= {"booking_mode", "booking_url"}
    content_fields = set(updates) - not_content
    if (
        content_fields
        and business.status is BusinessStatus.approved
        and not is_admin
    ):
        business.status = BusinessStatus.pending

    for field, value in updates.items():
        setattr(business, field, value)

    if "price_range" in updates:
        if updates["price_range"]:
            business.price_range_source = "owner"
        else:
            # Cleared: hand the level back to the service prices.
            business.price_range = None
            business.price_range_source = "services"
            price_level.refresh_price_range(db, business)

    db.commit()
    db.refresh(business)
    # Keep the listing findable by meaning (smart search layer 2); a no-op
    # when semantic search is off.
    background.add_task(
        embeddings.sync_in_background, sessionmaker(bind=db.get_bind(), future=True), business.id
    )
    return _detail(db, business)
