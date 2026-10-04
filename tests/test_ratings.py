"""A listing's rating is derived from its reviews, never set by hand.

recalculate_all_ratings() repairs placeholder numbers (the seed used to write
ratings with no reviews behind them): no reviews -> NULL / 0, otherwise the
average of the actual reviews, rounded to two places.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.models.business import Business, BusinessStatus
from app.models.business_review import BusinessReview
from app.models.category import Category
from app.models.user import User, UserRole
from app.services.ratings import recalculate_all_ratings, recalculate_rating


@pytest.fixture()
def db(test_engine):
    session = sessionmaker(bind=test_engine, future=True)()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _listing(db, category: Category, *, rating, review_count) -> Business:
    business = Business(
        name="Placeholder Plumbing",
        slug=f"ratings-{uuid.uuid4().hex[:10]}",
        category_id=category.id,
        city="Vancouver",
        province="BC",
        status=BusinessStatus.approved,
        is_active=True,
        rating=rating,
        review_count=review_count,
    )
    db.add(business)
    db.flush()
    return business


def _review(db, business: Business, stars: int) -> None:
    author = User(
        name="Reviewer",
        email=f"reviewer-{uuid.uuid4().hex[:10]}@example.ca",
        hashed_password=hash_password("password123"),
        role=UserRole.customer,
    )
    db.add(author)
    db.flush()
    db.add(BusinessReview(business_id=business.id, user_id=author.id, rating=stars))
    db.flush()


@pytest.fixture()
def category(db) -> Category:
    slug = f"ratings-{uuid.uuid4().hex[:10]}"
    category = Category(name=f"Ratings {slug}", slug=slug)
    db.add(category)
    db.flush()
    return category


def test_placeholder_rating_without_reviews_is_cleared(db, category):
    fake = _listing(db, category, rating=4.7, review_count=218)

    recalculate_all_ratings(db)
    db.refresh(fake)

    assert fake.rating is None
    assert fake.review_count == 0


def test_placeholder_rating_is_replaced_by_the_real_average(db, category):
    listing = _listing(db, category, rating=4.9, review_count=500)
    for stars in (5, 4, 4):
        _review(db, listing, stars)

    recalculate_all_ratings(db)
    db.refresh(listing)

    assert listing.rating == pytest.approx(4.33)
    assert listing.review_count == 3


def test_correct_rows_are_left_alone(db, category):
    listing = _listing(db, category, rating=None, review_count=0)
    reviewed = _listing(db, category, rating=None, review_count=0)
    _review(db, reviewed, 5)
    recalculate_rating(db, reviewed)
    db.flush()

    # Everything is already correct, so neither of this test's rows changes.
    recalculate_all_ratings(db)
    db.refresh(listing)
    db.refresh(reviewed)

    assert (listing.rating, listing.review_count) == (None, 0)
    assert (reviewed.rating, reviewed.review_count) == (5.0, 1)


def test_single_listing_recalculation_matches_bulk(db, category):
    one = _listing(db, category, rating=1.0, review_count=99)
    _review(db, one, 2)
    _review(db, one, 5)

    recalculate_rating(db, one)

    assert one.rating == pytest.approx(3.5)
    assert one.review_count == 2
