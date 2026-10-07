"""Impression logging, click tracking, placement analytics and /search/nearby."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import select, update

from app.models.business import Business
from app.models.search_impression import SearchImpression
from app.models.user import User

# Shared fixtures: a pinned clock, the migration's plans and a private category.
from tests.test_search_placement import (  # noqa: F401
    NOW,
    VANCOUVER,
    db_factory,
    pinned_clock,
    plan_ids,
    world,
)


def _impressions(db_factory, search_id: str) -> list[SearchImpression]:
    with db_factory() as db:
        return list(
            db.scalars(
                select(SearchImpression)
                .where(SearchImpression.search_id == uuid.UUID(search_id))
                .order_by(SearchImpression.position)
            )
        )


def _account(client, db_factory, email, *, role="customer", admin=False) -> dict:
    token = client.post(
        "/api/v1/signup",
        json={"name": "T", "email": email, "password": "password123", "role": role},
    ).json()["access_token"]
    if admin:
        with db_factory() as db:
            db.execute(update(User).where(User.email == email).values(is_admin=True))
            db.commit()
    return {"Authorization": f"Bearer {token}"}


# ----------------------------------------------------------------- logging


def test_every_result_shown_is_logged_with_position_tier_and_rounded_location(
    client, world, db_factory, unique_email
):
    add = world["add"]
    add("Annual", plan="annual")
    add("Monthly", plan="monthly")
    add("Free")
    headers = _account(client, db_factory, unique_email)

    body = client.get(
        "/api/v1/businesses/search",
        params={"category_slug": world["slug"], "lat": 49.28271, "lng": -123.12069},
        headers=headers,
    ).json()

    assert body["search_id"]
    rows = _impressions(db_factory, body["search_id"])
    assert [(r.position, r.tier, r.in_rotation) for r in rows] == [(1, 1, False), (2, 2, True), (3, 4, False)]
    assert all(r.user_id is not None for r in rows)
    assert (rows[0].latitude, rows[0].longitude) == (49.28, -123.12)
    assert rows[0].category_slug == world["slug"] and rows[0].sort == "relevance"


def test_searches_are_logged_against_the_signed_in_user(client, world, db_factory):
    # Search needs sign-in, so there is no anonymous search to log any more.
    world["add"]("Only")

    body = client.get("/api/v1/businesses/search", params={"category_slug": world["slug"]}).json()

    assert [r.user_id is not None for r in _impressions(db_factory, body["search_id"])] == [True]


def test_internal_lookups_and_empty_results_are_not_logged(client, world):
    world["add"]("Only")

    untracked = client.get(
        "/api/v1/businesses/search", params={"category_slug": world["slug"], "track": "false"}
    ).json()
    empty = client.get("/api/v1/businesses/search", params={"category_slug": "no-such-category"}).json()

    assert untracked["search_id"] is None and len(untracked["items"]) == 1
    assert empty["search_id"] is None


# ------------------------------------------------------------------ clicks


def test_only_the_first_click_on_an_impression_counts(client, world, db_factory):
    business_id = world["add"]("Clicked")
    search_id = client.get("/api/v1/businesses/search", params={"category_slug": world["slug"]}).json()["search_id"]

    first = client.post("/api/v1/search/clicks", json={"search_id": search_id, "business_id": business_id, "action": "call"})
    again = client.post("/api/v1/search/clicks", json={"search_id": search_id, "business_id": business_id, "action": "view"})
    never_shown = client.post("/api/v1/search/clicks", json={"search_id": str(uuid.uuid4()), "business_id": business_id, "action": "view"})
    bad_action = client.post("/api/v1/search/clicks", json={"search_id": search_id, "business_id": business_id, "action": "buy"})

    assert (first.status_code, first.json()) == (202, {"recorded": True})
    assert again.json() == {"recorded": False}
    assert never_shown.json() == {"recorded": False}
    assert bad_action.status_code == 422
    (row,) = _impressions(db_factory, search_id)
    assert row.click_action == "call" and row.clicked_at is not None


# --------------------------------------------------------------- analytics


def _search_and_click(client, slug, clicks: dict[int, str]) -> None:
    body = client.get("/api/v1/businesses/search", params={"category_slug": slug}).json()
    for business_id, action in clicks.items():
        client.post("/api/v1/search/clicks", json={"search_id": body["search_id"], "business_id": business_id, "action": action})


def test_admin_sees_ctr_per_tier(client, world, db_factory, unique_email):
    annual = world["add"]("Annual", plan="annual")
    world["add"]("Free")
    for _ in range(4):
        _search_and_click(client, world["slug"], {annual: "view"})
    _search_and_click(client, world["slug"], {})
    admin = _account(client, db_factory, unique_email, admin=True)

    report = client.get("/api/v1/admin/search-analytics", params={"days": 1}, headers=admin).json()

    tiers = {t["tier"]: t for t in report["tiers"]}
    # Other tests write impressions too, so compare this category's floor only.
    assert tiers["annual"]["clicks"] >= 4 and tiers["annual"]["impressions"] >= 5
    assert 0 < tiers["annual"]["ctr"] <= 1
    assert "rotation" in report and "top_performers" in report


def test_search_analytics_is_admin_only(client, db_factory, unique_email):
    customer = _account(client, db_factory, unique_email)

    assert client.get("/api/v1/admin/search-analytics", headers=customer).status_code == 403
    assert client.get("/api/v1/admin/search-analytics").status_code == 401


def test_rotation_fairness_is_measured_across_windows(client, world, pinned_clock, db_factory, unique_email):
    for i in range(6):
        world["add"](f"M{i}", plan="monthly")
    for step in range(2):  # two windows: all six lead once
        pinned_clock["now"] = NOW + timedelta(minutes=30 * step)
        for _ in range(10):
            _search_and_click(client, world["slug"], {})
    admin = _account(client, db_factory, unique_email, admin=True)

    rotation = client.get("/api/v1/admin/search-analytics", params={"days": 1}, headers=admin).json()["rotation"]

    mine = [s for s in rotation["subscribers"] if s["name"].startswith("M") and s["impressions"] == 20]
    assert len(mine) == 6
    # Each led in exactly one of the two windows: half their impressions.
    assert {s["leader_share"] for s in mine} == {0.5}


def test_owner_sees_their_own_listing_performance_and_nobody_elses(client, world, db_factory, unique_email):
    business_id = world["add"]("Owned", plan="annual")
    world["add"]("Rival")
    owner = _account(client, db_factory, unique_email, role="business_owner")
    with db_factory() as db:
        owner_id = db.scalar(select(User.id).where(User.email == unique_email))
        db.execute(update(Business).where(Business.id == business_id).values(owner_id=owner_id))
        db.commit()
    _search_and_click(client, world["slug"], {business_id: "call"})
    _search_and_click(client, world["slug"], {})

    mine = client.get(f"/api/v1/businesses/{business_id}/search-performance", headers=owner).json()
    stranger = _account(client, db_factory, f"other-{unique_email}", role="business_owner")
    theirs = client.get(f"/api/v1/businesses/{business_id}/search-performance", headers=stranger)

    assert (mine["impressions"], mine["clicks"], mine["ctr"], mine["avg_position"]) == (2, 1, 0.5, 1.0)
    assert mine["clicks_by_action"] == {"view": 0, "call": 1, "enquire": 0}
    assert mine["impressions_by_tier"] == {"annual": 2}
    assert len(mine["daily"]) == 1
    assert theirs.status_code == 403


# ------------------------------------------------------ /search/nearby + edges


def test_nearby_requires_a_point_and_defaults_to_25_km(client, world):
    add = world["add"]
    add("Close", km_north=2)
    add("Far away", km_north=60)

    missing = client.get("/api/v1/search/nearby", params={"category": world["slug"]})
    body = client.get(
        "/api/v1/search/nearby",
        params={"category": world["slug"], "lat": VANCOUVER[0], "lng": VANCOUVER[1]},
    ).json()

    assert missing.status_code == 422
    assert [i["name"] for i in body["items"]] == ["Close"]


def test_without_annual_subscribers_monthly_leads(client, world):
    add = world["add"]
    add("Free, best rated", rating=5.0)
    add("Monthly", rating=3.0, plan="monthly")

    items = client.get(
        "/api/v1/search/nearby",
        params={"category": world["slug"], "lat": VANCOUVER[0], "lng": VANCOUVER[1]},
    ).json()["items"]

    assert [i["name"] for i in items] == ["Monthly", "Free, best rated"]


def test_one_or_two_monthly_subscribers_are_always_in_rotation(client, world, pinned_clock):
    add = world["add"]
    add("M1", plan="monthly")
    add("M2", plan="monthly")
    add("Basic", plan="basic")

    for step in range(4):
        pinned_clock["now"] = NOW + timedelta(minutes=30 * step)
        items = client.get(
            "/api/v1/search/nearby",
            params={"category": world["slug"], "lat": VANCOUVER[0], "lng": VANCOUVER[1]},
        ).json()["items"]
        assert [i["in_rotation"] for i in items] == [True, True, False]
        assert items[2]["name"] == "Basic"
