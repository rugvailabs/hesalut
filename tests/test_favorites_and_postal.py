"""Saved listings, and postal-code search.

    PUT/DELETE /favorites/{id} are idempotent, need an account, and refuse a
    listing the public cannot see. GET /favorites hides a saved listing once it
    stops being public, without deleting the bookmark.

    /businesses/search matches a postal code, or just its area, with or
    without the space - through `postal_code` and through free text.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import update
from sqlalchemy.orm import sessionmaker

from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.verification import BusinessVerification, VerificationStatus


@pytest.fixture()
def db_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture()
def world(db_factory):
    """A fresh category per test, so each search sees only its own listings."""
    with db_factory() as db:
        slug = f"fav-{uuid.uuid4().hex[:10]}"
        category = Category(name=f"Favorites {slug}", slug=slug)
        db.add(category)
        db.commit()
        category_id = category.id

    def add(name: str, postal_code: str, *, public: bool = True) -> int:
        with db_factory() as db:
            business = Business(
                name=name,
                slug=f"{slug}-{uuid.uuid4().hex[:8]}",
                category_id=category_id,
                city="Vancouver",
                province="BC",
                postal_code=postal_code,
                status=BusinessStatus.approved if public else BusinessStatus.pending,
                is_active=True,
                verified=True,
                rating=4.0,
                review_count=3,
            )
            db.add(business)
            db.flush()
            db.add(
                BusinessVerification(
                    business_id=business.id,
                    email="kyc@example.ca",
                    mobile_number="6045550100",
                    status=VerificationStatus.verified,
                )
            )
            db.commit()
            return business.id

    return {"slug": slug, "add": add}


def _account(client, email) -> dict:
    token = client.post(
        "/api/v1/signup",
        json={"name": "T", "email": email, "password": "password123", "role": "customer"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------- favorites


def test_save_list_and_remove(client, world, unique_email):
    auth = _account(client, unique_email)
    first = world["add"]("First", "V6B 5P2")
    second = world["add"]("Second", "V6J 1M9")

    for business_id in (first, second, first):  # the repeat is a no-op
        assert client.put(f"/api/v1/favorites/{business_id}", headers=auth).status_code == 204

    saved = client.get("/api/v1/favorites", headers=auth).json()
    assert [row["business_id"] for row in saved] == [second, first]  # newest first
    assert saved[0]["name"] == "Second"
    assert saved[0]["category_slug"] == world["slug"]

    for _ in range(2):  # removing twice is also fine
        assert client.delete(f"/api/v1/favorites/{first}", headers=auth).status_code == 204
    assert [row["business_id"] for row in client.get("/api/v1/favorites", headers=auth).json()] == [
        second
    ]


def test_favorites_are_per_user(client, world, unique_email):
    mine = _account(client, unique_email)
    theirs = _account(client, f"other-{unique_email}")
    business_id = world["add"]("Shared", "V6B 1A1")

    client.put(f"/api/v1/favorites/{business_id}", headers=mine)
    assert client.get("/api/v1/favorites", headers=theirs).json() == []


def test_favorites_need_an_account(client, world):
    business_id = world["add"]("Anon", "V6B 1A1")
    assert client.get("/api/v1/favorites").status_code == 401
    assert client.put(f"/api/v1/favorites/{business_id}").status_code == 401


def test_cannot_save_a_hidden_listing(client, world, unique_email):
    auth = _account(client, unique_email)
    hidden = world["add"]("Pending", "V6B 1A1", public=False)
    assert client.put(f"/api/v1/favorites/{hidden}", headers=auth).status_code == 404
    assert client.put("/api/v1/favorites/999999999", headers=auth).status_code == 404


def test_a_listing_that_goes_private_drops_out_but_comes_back(
    client, world, db_factory, unique_email
):
    auth = _account(client, unique_email)
    business_id = world["add"]("Pausing", "V6B 1A1")
    client.put(f"/api/v1/favorites/{business_id}", headers=auth)

    def set_active(active: bool) -> None:
        with db_factory() as db:
            db.execute(
                update(Business).where(Business.id == business_id).values(is_active=active)
            )
            db.commit()

    set_active(False)
    assert client.get("/api/v1/favorites", headers=auth).json() == []
    set_active(True)
    assert [row["business_id"] for row in client.get("/api/v1/favorites", headers=auth).json()] == [
        business_id
    ]


# ------------------------------------------------------------- postal code


def _names(client, slug, **params) -> list[str]:
    r = client.get(
        "/api/v1/businesses/search",
        params={"category_slug": slug, "sort": "name", "track": "false", **params},
    )
    assert r.status_code == 200, r.text
    return [item["name"] for item in r.json()["items"]]


@pytest.mark.parametrize("value", ["V6B 5P2", "v6b5p2", "V6B5P", " v6b 5 "])
def test_postal_code_param_matches_ignoring_spaces_and_case(client, world, value):
    world["add"]("Yaletown", "V6B 5P2")
    world["add"]("Kitsilano", "V6J 1M9")
    assert _names(client, world["slug"], postal_code=value) == ["Yaletown"]


def test_postal_area_matches_every_code_in_it(client, world):
    world["add"]("Alpha", "V6B 5P2")
    world["add"]("Beta", "V6B 1A1")
    world["add"]("Gamma", "V6J 1M9")
    assert _names(client, world["slug"], postal_code="V6B") == ["Alpha", "Beta"]


def test_free_text_recognises_a_postal_code(client, world):
    world["add"]("Alpha", "V6B 5P2")
    world["add"]("Gamma", "V6J 1M9")
    assert _names(client, world["slug"], q="v6b5p2") == ["Alpha"]
    assert _names(client, world["slug"], q="V6J") == ["Gamma"]


def test_postal_code_wildcards_are_literal(client, world):
    world["add"]("Alpha", "V6B 5P2")
    assert _names(client, world["slug"], postal_code="%") == []
    assert _names(client, world["slug"], postal_code="V_B") == []


def test_cities_lists_only_public_listings(client, world):
    world["add"]("Public", "V6B 5P2")
    rows = client.get("/api/v1/businesses/cities").json()
    vancouver = next(row for row in rows if row["city"] == "Vancouver")
    assert vancouver["province"] == "BC"
    assert vancouver["business_count"] >= 1
