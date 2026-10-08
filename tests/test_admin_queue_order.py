"""The review queues list the newest submission first, like every other list."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.business import Business
from app.models.category import Category
from app.models.user import User
from app.models.verification import BusinessVerification


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-queue-order"))
        if category is None:
            category = Category(name="Test Queue Order", slug="test-queue-order")
            db.add(category)
            db.commit()
        return category.id


@pytest.fixture()
def admin_headers(client, session_factory) -> dict:
    email = f"queue-admin-{uuid.uuid4().hex[:8]}@example.ca"
    token = client.post(
        "/api/v1/signup", json={"name": "Admin", "email": email, "password": "password123"}
    ).json()["access_token"]
    with session_factory() as db:
        db.query(User).filter(User.email == email).update({"is_admin": True})
        db.commit()
    return {"Authorization": f"Bearer {token}"}


def _listing(client, category_id, name) -> tuple[dict, int]:
    token = client.post(
        "/api/v1/signup",
        json={
            "name": "Queue Owner",
            "email": f"queue-{uuid.uuid4().hex[:10]}@example.ca",
            "password": "password123",
            "phone": "+1-604-555-0100",
            "role": "business_owner",
        },
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post(
        "/api/v1/businesses",
        json={"name": name, "category_id": category_id, "city": "Vancouver"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return headers, r.json()["id"]


def _three_listings(client, category_id) -> dict[str, int]:
    """Listings named oldest/middle/newest by when they arrived (3 days, 1 day, now)."""
    tag = uuid.uuid4().hex[:6]
    return {
        key: _listing(client, category_id, f"Queue {key} {tag}")
        for key in ("oldest", "middle", "newest")
    } | {"tag": tag}


def test_listing_moderation_queue_is_newest_first(
    client, category_id, admin_headers, session_factory
):
    made = _three_listings(client, category_id)
    ids = {key: made[key][1] for key in ("oldest", "middle", "newest")}
    now = datetime.now(timezone.utc)
    with session_factory() as db:
        for key, age in (("oldest", timedelta(days=3)), ("middle", timedelta(days=1)), ("newest", timedelta())):
            db.get(Business, ids[key]).created_at = now - age
        db.commit()

    queue = client.get("/api/v1/admin/businesses?limit=100", headers=admin_headers).json()

    ours = [item["id"] for item in queue if item["id"] in ids.values()]
    assert ours == [ids["newest"], ids["middle"], ids["oldest"]]


def test_verification_queue_is_newest_first(client, category_id, admin_headers, session_factory):
    made = _three_listings(client, category_id)
    tag = made["tag"]
    submitted = {}
    for key in ("oldest", "middle", "newest"):
        headers, business_id = made[key]
        r = client.post(
            f"/api/v1/businesses/{business_id}/verification",
            json={"email": "kyc@example.ca", "mobile_number": "604 555 0100"},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        submitted[key] = r.json()["id"]
    now = datetime.now(timezone.utc)
    with session_factory() as db:
        for key, age in (("oldest", timedelta(days=3)), ("middle", timedelta(days=1)), ("newest", timedelta())):
            db.get(BusinessVerification, submitted[key]).submitted_at = now - age
        db.commit()

    queue = client.get("/api/v1/admin/verifications/pending?limit=100", headers=admin_headers).json()

    ours = [item["id"] for item in queue if item["id"] in submitted.values()]
    assert ours == [submitted["newest"], submitted["middle"], submitted["oldest"]]
    assert all(tag in item["business_name"] for item in queue if item["id"] in submitted.values())
