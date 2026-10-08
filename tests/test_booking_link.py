"""Booking phase 0: the external booking link, its validation and click count."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.booking_link_click import BookingLinkClick
from app.models.business import Business
from app.models.category import Category

PASSWORD = "bookinglink123"
URL = "https://book.squareup.com/appointments/abc"


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-booking"))
        if category is None:
            category = Category(name="Test Booking", slug="test-booking")
            db.add(category)
            db.commit()
        return category.id


@pytest.fixture()
def owner_headers(client) -> dict:
    email = f"owner-{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/v1/signup",
        json={"name": "Owner", "email": email, "password": PASSWORD, "role": "business_owner"},
    )
    token = client.post("/api/v1/login", json={"email": email, "password": PASSWORD}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def _create(client, headers, category_id, **extra):
    return client.post(
        "/api/v1/businesses",
        json={"name": "Link Salon", "category_id": category_id, "city": "Vancouver", **extra},
        headers=headers,
    )


def test_default_is_no_booking(client, owner_headers, category_id):
    body = _create(client, owner_headers, category_id).json()
    assert body["booking_mode"] == "none"
    assert body["booking_url"] is None


def test_external_booking_round_trips(client, owner_headers, category_id):
    r = _create(client, owner_headers, category_id, booking_mode="external", booking_url=URL)
    assert r.status_code == 201, r.text
    assert (r.json()["booking_mode"], r.json()["booking_url"]) == ("external", URL)


@pytest.mark.parametrize(
    "bad", ["http://insecure.example.com", "javascript:alert(1)", "https://u:p@example.com", "ftp://x.com"]
)
def test_only_plain_https_links_are_accepted(client, owner_headers, category_id, bad):
    r = _create(client, owner_headers, category_id, booking_mode="external", booking_url=bad)
    assert r.status_code == 422


def test_external_mode_needs_a_link(client, owner_headers, category_id):
    assert _create(client, owner_headers, category_id, booking_mode="external").status_code == 422


def test_turning_booking_off_clears_the_link(client, owner_headers, category_id):
    created = _create(client, owner_headers, category_id, booking_mode="external", booking_url=URL).json()
    r = client.patch(
        f"/api/v1/businesses/{created['id']}", json={"booking_mode": "none"}, headers=owner_headers
    )
    assert r.status_code == 200, r.text
    assert (r.json()["booking_mode"], r.json()["booking_url"]) == ("none", None)


def test_patch_to_external_without_a_link_is_refused(client, owner_headers, category_id):
    created = _create(client, owner_headers, category_id).json()
    r = client.patch(
        f"/api/v1/businesses/{created['id']}", json={"booking_mode": "external"}, headers=owner_headers
    )
    assert r.status_code == 422


def test_clicks_are_not_counted_for_an_unlisted_business(client, owner_headers, category_id, session_factory):
    # A new listing is pending moderation, so the public cannot see it.
    created = _create(client, owner_headers, category_id, booking_mode="external", booking_url=URL).json()
    assert client.post(f"/api/v1/businesses/{created['id']}/booking-clicks").status_code == 404
    with session_factory() as db:
        assert db.scalars(select(BookingLinkClick)).first() is None


def test_click_is_counted_and_shown_to_the_owner(client, owner_headers, category_id, session_factory, monkeypatch):
    created = _create(client, owner_headers, category_id, booking_mode="external", booking_url=URL).json()
    import app.api.v1.search as search_module

    monkeypatch.setattr(
        search_module,
        "require_visible_business",
        lambda db, business_id: db.get(Business, business_id),
    )
    for _ in range(2):
        assert client.post(f"/api/v1/businesses/{created['id']}/booking-clicks").status_code == 204
    perf = client.get(
        f"/api/v1/businesses/{created['id']}/search-performance", headers=owner_headers
    ).json()
    assert perf["booking_clicks"] == 2
