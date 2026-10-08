"""The denormalised rating on a listing, derived from its reviews.

`businesses.rating` / `review_count` exist because search sorts and filters on
them, and a correlated subquery per row would not survive a real catalogue.
They are only ever *recomputed* from `business_reviews` - never set by hand and
never incremented - so they cannot drift from the reviews behind them.

A listing with no reviews is NULL, not 0.0: "unrated" and "rated zero" are
different, and ?min_rating must not match the former.
"""

from sqlalchemy import Float, cast, func, select, update
from sqlalchemy.orm import Session

from app.models.business import Business
from app.models.business_review import BusinessReview


def recalculate_rating(db: Session, business: Business) -> None:
    """Refresh one listing's rating and review count from its reviews."""
    average, count = db.execute(
        select(func.avg(BusinessReview.rating), func.count(BusinessReview.id)).where(
            BusinessReview.business_id == business.id
        )
    ).one()
    business.rating = round(float(average), 2) if average is not None else None
    business.review_count = count or 0


def recalculate_all_ratings(db: Session) -> int:
    """Refresh every listing in one statement. Returns how many rows changed.

    For repairing data written before this rule held - e.g. seeded placeholder
    ratings with no reviews behind them.
    """
    avg_rating = (
        select(cast(func.round(func.avg(BusinessReview.rating), 2), Float))
        .where(BusinessReview.business_id == Business.id)
        .scalar_subquery()
    )
    review_count = (
        select(func.count(BusinessReview.id))
        .where(BusinessReview.business_id == Business.id)
        .scalar_subquery()
    )
    result = db.execute(
        update(Business)
        .where(
            Business.rating.is_distinct_from(avg_rating)
            | Business.review_count.is_distinct_from(review_count)
        )
        .values(rating=avg_rating, review_count=review_count)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount or 0
