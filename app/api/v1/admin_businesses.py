"""Admin moderation of directory listings.

Every route here is admin-only, and every decision writes an audit row naming
the moderator - matching the submission review console in review.py. A listing
going live, or being pulled down, is exactly the kind of action that needs to
be attributable later.

Approve/reject/suspend are separate verbs rather than one PATCH of `status`
because they are not symmetric: a rejection and a suspension both require a
reason the owner will read, an approval does not.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import require_admin
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.user import User
from app.schemas.directory import (
    BusinessDetail,
    ModerationDecision,
    ModerationQueueItem,
    ModerationStats,
)

router = APIRouter(prefix="/admin/businesses", tags=["admin"])


def _actor(user: User) -> str:
    return f"user:{user.id}"


def _load(db: Session, business_id: int) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found"
        )
    return business


def _detail(db: Session, business: Business) -> BusinessDetail:
    detail = BusinessDetail.model_validate(business)
    category = db.get(Category, business.category_id)
    if category is not None:
        detail.category_slug = category.slug
        detail.category_name = category.name
    return detail


def _decide(
    db: Session,
    business: Business,
    moderator: User,
    new_status: BusinessStatus,
    note: str | None,
    action: str,
) -> BusinessDetail:
    """Apply a moderation decision, then record who made it."""
    previous = business.status
    business.status = new_status
    business.moderation_note = note
    business.moderated_at = datetime.now(timezone.utc)
    business.moderated_by = moderator.id
    db.commit()
    db.refresh(business)

    # After the commit: log_audit commits the session itself, and a failed
    # audit write must never roll back the decision it describes.
    log_audit(
        db,
        actor=_actor(moderator),
        action=action,
        target_table="businesses",
        target_id=business.id,
        metadata={
            "from": previous.value,
            "to": new_status.value,
            "slug": business.slug,
            "note": note,
        },
    )
    return _detail(db, business)


@router.get("/stats", response_model=ModerationStats)
def moderation_stats(
    _: User = Depends(require_admin), db: Session = Depends(get_db)
) -> ModerationStats:
    """How many listings sit in each status."""
    rows = db.execute(
        select(Business.status, func.count(Business.id)).group_by(Business.status)
    ).all()
    counts = {s.value: 0 for s in BusinessStatus}
    for status_value, count in rows:
        counts[status_value.value] = count

    return ModerationStats(
        pending=counts["pending"],
        approved=counts["approved"],
        rejected=counts["rejected"],
        suspended=counts["suspended"],
    )


@router.get("", response_model=list[ModerationQueueItem])
def list_for_moderation(
    status_filter: BusinessStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ModerationQueueItem]:
    """Listings awaiting or having had a decision.

    Defaults to pending - the queue is the point - and orders newest first,
    like every other list in this API. The admin page tags each row with how
    long it has been waiting, so the oldest ones stay visible at the bottom.
    """
    wanted = BusinessStatus.pending if status_filter is None else status_filter

    rows = db.execute(
        select(Business, Category.name, User.email)
        .join(Category, Category.id == Business.category_id)
        .outerjoin(User, User.id == Business.owner_id)
        .where(Business.status == wanted)
        .order_by(Business.created_at.desc(), Business.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return [
        ModerationQueueItem(
            id=b.id,
            name=b.name,
            slug=b.slug,
            status=b.status,
            city=b.city,
            province=b.province,
            address=b.address,
            description=b.description,
            phone=b.phone,
            website=b.website,
            category_name=category_name,
            owner_id=b.owner_id,
            owner_email=owner_email,
            moderation_note=b.moderation_note,
            moderated_at=b.moderated_at,
            created_at=b.created_at,
        )
        for b, category_name, owner_email in rows
    ]


@router.post("/{business_id}/approve", response_model=BusinessDetail)
def approve_listing(
    business_id: int,
    payload: ModerationDecision | None = None,
    moderator: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BusinessDetail:
    """Publish a listing. Works from any status, so it doubles as reinstate."""
    business = _load(db, business_id)
    note = payload.reason if payload is not None else None
    return _decide(
        db, business, moderator, BusinessStatus.approved, note, "business.approved"
    )


@router.post("/{business_id}/reject", response_model=BusinessDetail)
def reject_listing(
    business_id: int,
    payload: ModerationDecision,
    moderator: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BusinessDetail:
    """Refuse a listing. The reason is shown to the owner."""
    business = _load(db, business_id)
    return _decide(
        db,
        business,
        moderator,
        BusinessStatus.rejected,
        payload.reason,
        "business.rejected",
    )


@router.post("/{business_id}/suspend", response_model=BusinessDetail)
def suspend_listing(
    business_id: int,
    payload: ModerationDecision,
    moderator: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BusinessDetail:
    """Pull a live listing down. The reason is shown to the owner."""
    business = _load(db, business_id)
    return _decide(
        db,
        business,
        moderator,
        BusinessStatus.suspended,
        payload.reason,
        "business.suspended",
    )
