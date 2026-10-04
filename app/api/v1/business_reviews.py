"""Customer reviews of a listing, and the owner's reply to each.

Distinct from app/api/v1/review.py, which is the voice-submission moderation
console. Same word, unrelated feature.

Access rules:
  GET  /businesses/{id}/reviews                 public
  POST /businesses/{id}/reviews                 any signed-in user (not the owner)
  POST /businesses/{id}/reviews/{rid}/reply     that listing's owner only
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_owned_business
from app.core.visibility import require_visible_business
from app.models.business import Business
from app.models.business_review import BusinessReview
from app.models.user import User
from app.schemas.directory import (
    BusinessReviewCreate,
    BusinessReviewOut,
    BusinessReviewSummary,
    OwnerReplyCreate,
)
from app.services.ratings import recalculate_rating

router = APIRouter(prefix="/businesses", tags=["directory"])


def _to_out(review: BusinessReview) -> BusinessReviewOut:
    return BusinessReviewOut(
        id=review.id,
        business_id=review.business_id,
        rating=review.rating,
        title=review.title,
        body=review.body,
        owner_reply=review.owner_reply,
        owner_replied_at=review.owner_replied_at,
        created_at=review.created_at,
        author_id=review.user_id,
        author_name=review.author.name if review.author is not None else "Former user",
    )


def _visible_business(db: Session, business_id: int) -> Business:
    """A listing the public may read or write reviews for.

    Reviews are part of the public record of a business, so they are gated on
    exactly the same rule as the listing itself - app/core/visibility.py. A
    hidden listing whose reviews stay readable leaks both its existence and
    what people said about it.
    """
    return require_visible_business(db, business_id)


@router.get("/{business_id}/reviews", response_model=list[BusinessReviewOut])
def list_reviews(
    business_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[BusinessReviewOut]:
    """Reviews for a listing, newest first. Public."""
    business = _visible_business(db, business_id)

    reviews = db.scalars(
        select(BusinessReview)
        .where(BusinessReview.business_id == business.id)
        # id as tiebreak so offset paging is stable.
        .order_by(BusinessReview.created_at.desc(), BusinessReview.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [_to_out(r) for r in reviews]


@router.get("/{business_id}/reviews/summary", response_model=BusinessReviewSummary)
def review_summary(
    business_id: int, db: Session = Depends(get_db)
) -> BusinessReviewSummary:
    """Average, count and the 5..1 histogram. Public."""
    business = _visible_business(db, business_id)

    rows = db.execute(
        select(BusinessReview.rating, func.count(BusinessReview.id))
        .where(BusinessReview.business_id == business.id)
        .group_by(BusinessReview.rating)
    ).all()

    breakdown = {star: 0 for star in range(1, 6)}
    total = 0
    weighted = 0
    for rating, count in rows:
        breakdown[rating] = count
        total += count
        weighted += rating * count

    return BusinessReviewSummary(
        average_rating=round(weighted / total, 2) if total else None,
        review_count=total,
        breakdown=breakdown,
    )


@router.post(
    "/{business_id}/reviews",
    response_model=BusinessReviewOut,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    business_id: int,
    payload: BusinessReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessReviewOut:
    """Leave a review. Requires an account, unlike an enquiry."""
    business = _visible_business(db, business_id)

    # An owner reviewing their own listing is self-dealing, not feedback.
    if business.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot review your own listing",
        )

    review = BusinessReview(
        business_id=business.id,
        user_id=current_user.id,
        rating=payload.rating,
        title=payload.title,
        body=payload.body,
    )
    db.add(review)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        # The unique constraint is the real guard; this turns it into an
        # answer the front end can act on instead of a 500.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reviewed this listing",
        )

    recalculate_rating(db, business)
    db.commit()
    db.refresh(review)
    return _to_out(review)


@router.post(
    "/{business_id}/reviews/{review_id}/reply", response_model=BusinessReviewOut
)
def reply_to_review(
    review_id: int,
    payload: OwnerReplyCreate,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BusinessReviewOut:
    """Reply to a review on a listing the caller owns.

    One reply per review: calling this again overwrites the previous text,
    which is why the dashboard hides the form once a reply exists.
    """
    review = db.get(BusinessReview, review_id)
    # Check the review belongs to *this* listing, or an owner could reply to
    # any review by pairing their own business id with someone else's review.
    if review is None or review.business_id != business.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )

    review.owner_reply = payload.reply
    review.owner_replied_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(review)
    return _to_out(review)
