"""The booking seed: services and booking requests for the demo listings only."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.models.booking import BookableService
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.services import booking_rules
from scripts.seed_booking import SERVICES_BY_CATEGORY, seed_booking
from scripts.seed_directory import BUSINESSES


@pytest.fixture()
def db(test_engine):
    session = sessionmaker(bind=test_engine, future=True)()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _fixture_row(category_slug):
    return next(row for row in BUSINESSES if row[2] == category_slug)


def _category(db, slug):
    cat = db.scalar(select(Category).where(Category.slug == slug))
    if cat is None:
        cat = Category(name=slug.title(), slug=slug)
        db.add(cat)
        db.flush()
    return cat


def _demo_listing(db, category_slug, **extra):
    """A listing under a fixture slug, which is what the seed recognises as demo data."""
    row = _fixture_row(category_slug)
    business = db.scalar(select(Business).where(Business.slug == row[0]))
    if business is None:
        business = Business(
            slug=row[0],
            name=row[1],
            category_id=_category(db, category_slug).id,
            city="Vancouver",
            province="BC",
            status=BusinessStatus.approved,
            is_active=True,
        )
        db.add(business)
    for key, value in extra.items():
        setattr(business, key, value)
    db.flush()
    return business


def _services(db, business):
    return db.scalar(
        select(func.count()).select_from(BookableService).where(BookableService.business_id == business.id)
    )


def test_every_bookable_category_has_services_and_every_service_category_is_bookable():
    assert all(booking_rules.style_for(slug) for slug in SERVICES_BY_CATEGORY)
    assert set(SERVICES_BY_CATEGORY) == set(booking_rules.STYLE_BY_CATEGORY)
    for items in SERVICES_BY_CATEGORY.values():
        for name, minutes, price in items:
            assert name and 5 <= minutes <= 720 and (price is None or price >= 0)


def test_seeds_services_and_switches_requests_on(db):
    dentist = _demo_listing(db, "dentists", booking_mode="none", booking_url=None, cancellation_policy=None)
    seed_booking(db)
    assert _services(db, dentist) == len(SERVICES_BY_CATEGORY["dentists"])
    assert dentist.booking_mode == "request"
    assert "24 hours" in dentist.cancellation_policy


def test_rerun_changes_nothing(db):
    _demo_listing(db, "salons", booking_mode="none")
    seed_booking(db)
    created, switched, _ = seed_booking(db)
    assert (created, switched) == (0, 0)


def test_leaves_external_links_alone(db):
    gym = _demo_listing(db, "gyms", booking_mode="external", booking_url="https://example.com/book")
    seed_booking(db)
    assert gym.booking_mode == "external" and gym.booking_url == "https://example.com/book"


def test_does_not_overwrite_services_an_owner_already_made(db):
    plumber = _demo_listing(db, "plumbers", booking_mode="none")
    db.add(BookableService(business_id=plumber.id, name="My own service", duration_minutes=30))
    db.flush()
    before = _services(db, plumber)
    seed_booking(db)
    assert _services(db, plumber) == before


def test_ignores_listings_that_are_not_demo_data_or_not_bookable(db):
    owned = Business(
        slug=f"owner-made-{uuid.uuid4().hex[:6]}",
        name="Owner Made",
        category_id=_category(db, "dentists").id,
        city="Vancouver",
        province="BC",
        status=BusinessStatus.approved,
        is_active=True,
    )
    restaurant = _demo_listing(db, "restaurants", booking_mode="none")
    db.add(owned)
    db.flush()
    seed_booking(db)
    assert owned.booking_mode == "none" and _services(db, owned) == 0
    assert restaurant.booking_mode == "none" and _services(db, restaurant) == 0
