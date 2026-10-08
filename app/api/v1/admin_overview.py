"""Admin overview stats and review moderation.

Listing moderation lives in admin_businesses.py; this is the rest of the admin
surface. Both are behind require_admin.

Deleting a review is the one destructive action an admin has here, so it
writes an audit row carrying enough of the deleted content to answer "what was
removed, and by whom" after the fact - the row itself is gone.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import require_admin
from app.models.business import Business, BusinessStatus
from app.models.business_review import BusinessReview
from app.models.chat import Conversation
from app.models.enquiry import Enquiry
from app.models.user import User
from app.models.verification import BusinessVerification, VerificationStatus
from app.schemas.directory import AdminReviewItem, AdminStats
from app.services.ratings import recalculate_rating

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
def admin_stats(
    _: User = Depends(require_admin), db: Session = Depends(get_db)
) -> AdminStats:
    """Counts across the whole directory, for the admin landing page."""
    by_status = dict(
        db.execute(
            select(Business.status, func.count(Business.id)).group_by(Business.status)
        ).all()
    )

    return AdminStats(
        total_businesses=db.scalar(select(func.count(Business.id))) or 0,
        pending_listings=by_status.get(BusinessStatus.pending, 0),
        approved_listings=by_status.get(BusinessStatus.approved, 0),
        rejected_listings=by_status.get(BusinessStatus.rejected, 0),
        suspended_listings=by_status.get(BusinessStatus.suspended, 0),
        total_users=db.scalar(select(func.count(User.id))) or 0,
        total_reviews=db.scalar(select(func.count(BusinessReview.id))) or 0,
        total_enquiries=db.scalar(select(func.count(Enquiry.id))) or 0,
        total_conversations=db.scalar(select(func.count(Conversation.id))) or 0,
        pending_verifications=db.scalar(
            select(func.count(BusinessVerification.id)).where(
                BusinessVerification.status == VerificationStatus.pending
            )
        )
        or 0,
    )


@router.get("/reviews", response_model=list[AdminReviewItem])
def list_all_reviews(
    q: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[AdminReviewItem]:
    """Every review, newest first, optionally filtered.

    Unlike the public list this spans all businesses and includes the author's
    email: moderation means knowing who wrote something, which is exactly the
    detail the public endpoint withholds.
    """
    stmt = (
        select(BusinessReview, Business, User)
        .join(Business, Business.id == BusinessReview.business_id)
        .join(User, User.id == BusinessReview.user_id)
    )

    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Business.name.ilike(needle),
                User.name.ilike(needle),
                User.email.ilike(needle),
                BusinessReview.title.ilike(needle),
                BusinessReview.body.ilike(needle),
            )
        )

    rows = db.execute(
        stmt.order_by(BusinessReview.created_at.desc(), BusinessReview.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return [
        AdminReviewItem(
            id=review.id,
            business_id=business.id,
            business_name=business.name,
            business_slug=business.slug,
            rating=review.rating,
            title=review.title,
            body=review.body,
            owner_reply=review.owner_reply,
            author_id=author.id,
            author_name=author.name,
            author_email=author.email,
            created_at=review.created_at,
        )
        for review, business, author in rows
    ]


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    moderator: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a review and refresh the listing's rating.

    Admin-only by design: a business deleting its own bad reviews would make
    every rating on the site meaningless. Owners can reply, not delete.
    """
    review = db.get(BusinessReview, review_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )

    business = db.get(Business, review.business_id)
    # Captured before the delete: the audit row is the only remaining record.
    snapshot = {
        "business_id": review.business_id,
        "author_id": review.user_id,
        "rating": review.rating,
        "title": review.title,
        "body": (review.body or "")[:500],
    }

    db.delete(review)
    db.flush()
    if business is not None:
        recalculate_rating(db, business)
    db.commit()

    log_audit(
        db,
        actor=f"user:{moderator.id}",
        action="review.deleted",
        target_table="business_reviews",
        target_id=review_id,
        metadata=snapshot,
    )
