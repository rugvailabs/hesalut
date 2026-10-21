"""Browsing is public; phone numbers, enquiries and bookings need sign-in."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.verification import BusinessVerification, VerificationStatus
from tests.conftest import ANONYMOUS_HEADER

ANON = {ANONYMOUS_HEADER: "1"}

PUBLIC = [
    "/api/v1/businesses/search?q=plumber",
    "/api/v1/search/nearby?lat=49.28&lng=-123.12",
    "/api/v1/search/understand?q=plumber",
    "/api/v1/categories",
    "/api/v1/businesses/cities",
]


@pytest.fixture()
def listing(client, test_engine) -> dict:
    """One publicly visible listing with a phone and a WhatsApp number."""
    factory = sessionmaker(bind=test_engine, future=True)
    with factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-public-browsing"))
        if category is None:
            category = Category(name="Test Public Browsing", slug="test-public-browsing")
            db.add(category)
            db.commit()
        category_id = category.id

    token = client.post(
        "/api/v1/signup",
        json={
            "name": "Browse Owner",
            "email": f"browse-{uuid.uuid4().hex[:10]}@example.ca",
            "password": "password123",
            "phone": "+1-604-555-0100",
            "role": "business_owner",
        },
    ).json()["access_token"]
    r = client.post(
        "/api/v1/businesses",
        json={
            "name": f"Browse Plumbing {uuid.uuid4().hex[:6]}",
            "category_id": category_id,
            "city": "Vancouver",
            "phone": "604 555 0199",
            "whatsapp": "604 555 0198",
            "email": "hello@example.ca",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    business = r.json()
    with factory() as db:
        db.get(Business, business["id"]).status = BusinessStatus.approved
        db.add(
            BusinessVerification(
                business_id=business["id"],
                email="kyc@example.ca",
                mobile_number="604 555 0100",
                status=VerificationStatus.verified,
            )
        )
        db.commit()
    return {"id": business["id"], "slug": business["slug"]}


@pytest.mark.parametrize("path", PUBLIC)
def test_signed_out_visitors_can_search(client, path):
    assert client.get(path, headers=ANON).status_code == 200


@pytest.mark.parametrize("path", PUBLIC[:3])
def test_a_garbage_token_is_treated_as_signed_out(client, path):
    r = client.get(path, headers={**ANON, "Authorization": "Bearer not-a-token"})

    assert r.status_code == 200


def test_signed_out_visitors_can_read_a_listing_and_its_reviews(client, listing):
    for path in (
        f"/api/v1/businesses/by-slug/{listing['slug']}",
        f"/api/v1/businesses/{listing['id']}/reviews",
        f"/api/v1/businesses/{listing['id']}/reviews/summary",
    ):
        assert client.get(path, headers=ANON).status_code == 200, path


def test_numbers_are_withheld_from_signed_out_visitors(client, listing):
    detail = client.get(f"/api/v1/businesses/by-slug/{listing['slug']}", headers=ANON).json()

    assert detail["phone"] is None and detail["whatsapp"] is None
    assert detail["contact_hidden"] is True
    # Only the numbers: the rest of the contact card stays public.
    assert detail["email"] == "hello@example.ca"

    results = client.get(
        "/api/v1/businesses/search", params={"category_slug": "test-public-browsing"}, headers=ANON
    ).json()["items"]
    mine = next(i for i in results if i["id"] == listing["id"])
    assert mine["phone"] is None and mine["contact_hidden"] is True


def test_signed_in_visitors_see_the_numbers(client, listing):
    # The client's default visitor is signed in.
    detail = client.get(f"/api/v1/businesses/by-slug/{listing['slug']}").json()

    assert detail["phone"] and detail["whatsapp"]
    assert detail["contact_hidden"] is False

    results = client.get(
        "/api/v1/businesses/search", params={"category_slug": "test-public-browsing"}
    ).json()["items"]
    mine = next(i for i in results if i["id"] == listing["id"])
    assert mine["phone"] and mine["contact_hidden"] is False


def test_an_enquiry_needs_sign_in(client, listing):
    body = {"enquiry_type": "callback", "message": "Please call me back."}

    anonymous = client.post(f"/api/v1/businesses/{listing['id']}/enquiries", json=body, headers=ANON)
    signed_in = client.post(f"/api/v1/businesses/{listing['id']}/enquiries", json=body)

    assert anonymous.status_code == 401
    assert signed_in.status_code == 201, signed_in.text


def test_a_booking_needs_sign_in(client):
    assert client.post("/api/v1/bookings", json={}, headers=ANON).status_code == 401
