"""Multi-select search facets: several categories, cities and rating bands,
and the opening-hours requirements.

Hours are evaluated in Vancouver time at a pinned instant, so "open now" is
deterministic: 2026-09-18 is a Friday, and 03:00 UTC is 20:00 on Thursday in
Vancouver (PDT, UTC-7).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.verification import BusinessVerification, VerificationStatus
from app.services import placement

THURSDAY_8PM_VANCOUVER = datetime(2026, 9, 18, 3, 0, tzinfo=timezone.utc)
FRIDAY_1AM_VANCOUVER = datetime(2026, 9, 18, 8, 0, tzinfo=timezone.utc)


@pytest.fixture()
def db_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture()
def clock(monkeypatch):
    state = {"now": THURSDAY_8PM_VANCOUVER}
    monkeypatch.setattr(placement, "now_utc", lambda: state["now"])
    return state


@pytest.fixture()
def world(db_factory):
    """Two fresh categories, so each test's searches see only its own listings."""
    tag = uuid.uuid4().hex[:10]
    with db_factory() as db:
        cats = [Category(name=f"Multi {tag} {i}", slug=f"multi-{tag}-{i}") for i in (1, 2)]
        db.add_all(cats)
        db.commit()
        slugs = [c.slug for c in cats]
        ids = {c.slug: c.id for c in cats}

    def add(name: str, *, category: int = 0, city: str = "Vancouver", rating=4.0, hours=None) -> int:
        with db_factory() as db:
            business = Business(
                name=name,
                slug=f"{tag}-{uuid.uuid4().hex[:8]}",
                category_id=ids[slugs[category]],
                city=city,
                province="BC",
                status=BusinessStatus.approved,
                is_active=True,
                verified=True,
                rating=rating,
                review_count=5 if rating is not None else 0,
                opening_hours=hours,
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

    return {"slugs": slugs, "add": add}


def _names(client, params) -> list[str]:
    r = client.get(
        "/api/v1/businesses/search",
        params=[("sort", "name"), ("track", "false"), ("page_size", "50"), *params],
    )
    assert r.status_code == 200, r.text
    return [item["name"] for item in r.json()["items"]]


def _both(world) -> list[tuple[str, str]]:
    return [("category_slug", s) for s in world["slugs"]]


# ------------------------------------------------------------ list facets


def test_several_categories_mean_any_of_them(client, world):
    world["add"]("A", category=0)
    world["add"]("B", category=1)
    assert _names(client, _both(world)) == ["A", "B"]
    assert _names(client, [("category_slug", world["slugs"][1])]) == ["B"]


def test_several_cities_mean_any_of_them(client, world):
    world["add"]("Van", city="Vancouver")
    world["add"]("Bby", city="Burnaby")
    world["add"]("Sry", city="Surrey")
    assert _names(client, [*_both(world), ("city", "burnaby"), ("city", "Surrey")]) == ["Bby", "Sry"]


def test_rating_bands_are_half_open_and_combine(client, world):
    world["add"]("five", rating=5.0)
    world["add"]("four-nine", rating=4.99)
    world["add"]("four-five", rating=4.5)
    world["add"]("four-four", rating=4.49)
    world["add"]("three", rating=3.0)
    world["add"]("unrated", rating=None)
    base = _both(world)
    assert _names(client, [*base, ("rating_band", "5")]) == ["five"]
    assert _names(client, [*base, ("rating_band", "4.5")]) == ["four-five", "four-nine"]
    assert _names(client, [*base, ("rating_band", "4"), ("rating_band", "3")]) == ["four-four", "three"]


def test_unknown_band_or_hours_is_rejected(client):
    assert client.get("/api/v1/businesses/search", params={"rating_band": "2"}).status_code == 422
    assert client.get("/api/v1/businesses/search", params={"hours": "always"}).status_code == 422


# ------------------------------------------------------------------ hours


DAYTIME = {day: [["09:00", "17:00"]] for day in ("mon", "tue", "wed", "thu", "fri")}
EVENING = {"thu": [["17:00", "22:00"]], "sat": [["10:00", "14:00"]]}
LATE_NIGHT = {"thu": [["18:00", "02:00"]]}  # runs past midnight into Friday


def test_open_now_at_8pm_thursday(client, world, clock):
    world["add"]("daytime", hours=DAYTIME)
    world["add"]("evening", hours=EVENING)
    world["add"]("late", hours=LATE_NIGHT)
    world["add"]("no-hours", hours=None)
    assert _names(client, [*_both(world), ("hours", "open_now")]) == ["evening", "late"]


def test_open_now_after_midnight_uses_yesterdays_late_range(client, world, clock):
    clock["now"] = FRIDAY_1AM_VANCOUVER
    world["add"]("late", hours=LATE_NIGHT)
    world["add"]("evening", hours=EVENING)
    assert _names(client, [*_both(world), ("hours", "open_now")]) == ["late"]


def test_weekends_and_evenings(client, world, clock):
    world["add"]("daytime", hours=DAYTIME)
    world["add"]("evening", hours=EVENING)
    world["add"]("late", hours=LATE_NIGHT)
    base = _both(world)
    assert _names(client, [*base, ("hours", "weekends")]) == ["evening"]
    assert _names(client, [*base, ("hours", "evenings")]) == ["evening", "late"]
    # Every hours requirement must hold.
    assert _names(client, [*base, ("hours", "weekends"), ("hours", "evenings")]) == ["evening"]


def test_hours_filters_survive_json_null_and_odd_shapes(client, world, clock):
    # hours=None stores JSON null (not SQL NULL) - the shape some seeded rows
    # really have - and a day that is not a list must not break the query.
    world["add"]("null-hours", hours=None)
    world["add"]("odd-hours", hours={"thu": "closed", "sat": None})
    for option in ("open_now", "weekends", "evenings"):
        assert _names(client, [*_both(world), ("hours", option)]) == []


# ------------------------------------------------------------------ price


def _add_priced(world, db_factory, name, price):
    business_id = world["add"](name)
    with db_factory() as db:
        db.execute(
            Business.__table__.update().where(Business.id == business_id).values(price_range=price)
        )
        db.commit()
    return business_id


def test_price_levels_mean_any_of_them(client, world, db_factory):
    _add_priced(world, db_factory, "cheap", "$")
    _add_priced(world, db_factory, "mid", "$$")
    _add_priced(world, db_factory, "dear", "$$$$")
    _add_priced(world, db_factory, "unpriced", None)
    base = _both(world)
    assert _names(client, [*base, ("price", "$")]) == ["cheap"]
    assert _names(client, [*base, ("price", "$"), ("price", "$$$$")]) == ["cheap", "dear"]
    assert client.get("/api/v1/businesses/search", params={"price": "cheap"}).status_code == 422


def test_price_sort_is_cheapest_first_unpriced_last(client, world, db_factory):
    _add_priced(world, db_factory, "dear", "$$$")
    _add_priced(world, db_factory, "unpriced", None)
    _add_priced(world, db_factory, "cheap", "$")
    r = client.get(
        "/api/v1/businesses/search",
        params=[("sort", "price"), ("track", "false"), *_both(world)],
    )
    assert [i["name"] for i in r.json()["items"]] == ["cheap", "dear", "unpriced"]


def test_list_items_carry_price_hours_and_listing_date(client, world, db_factory):
    _add_priced(world, db_factory, "a", "$$")
    world["add"]("b", hours=EVENING)
    items = {
        i["name"]: i
        for i in client.get(
            "/api/v1/businesses/search", params=[("track", "false"), *_both(world)]
        ).json()["items"]
    }
    assert items["a"]["price_range"] == "$$"
    assert items["b"]["opening_hours"] == EVENING
    assert items["a"]["opening_hours"] is None  # JSON null comes back as null
    assert items["a"]["created_at"] is not None
