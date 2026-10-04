"""The price level ("$" to "$$$$") follows service prices unless the owner set one."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.booking import BookableService
from app.models.business import Business
from app.services import price_level
from scripts.seed_booking import seed_booking
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    _user,
    db_factory,
    emails,
    shop,
)
from tests.test_seed_booking import _demo_listing, db  # noqa: F401


# ------------------------------------------------------------ pure rules
@pytest.mark.parametrize(
    "prices, expected",
    [
        ([], None),
        ([None], None),
        ([0], None),  # free says nothing about what the business charges
        ([None, 0, 3000], "$"),
        ([4999], "$"),
        ([5000], "$$"),  # a band's lower edge belongs to the higher level
        ([14999], "$$"),
        ([15000], "$$$"),
        ([39999], "$$$"),
        ([40000], "$$$$"),
        ([2500, 9000, 400000], "$$"),  # the median, so one expensive extra does not dominate
        ([9000, 21000], "$$$"),  # even count: the middle two averaged (15000)
    ],
)
def test_level_for(prices, expected):
    assert price_level.level_for(prices) == expected


def test_bands_and_levels_line_up():
    assert len(price_level.BANDS_CENTS) + 1 == len(price_level.LEVELS)
    assert list(price_level.BANDS_CENTS) == sorted(price_level.BANDS_CENTS)


# ------------------------------------------------------------- API flow
def _url(shop, suffix=""):
    return f"/api/v1/businesses/{shop['bid']}{suffix}"


def _level(client, shop):
    return client.get(_url(shop), headers=shop["owner"]).json()["price_range"]


def test_adding_priced_services_sets_the_level(client, shop):
    # The fixture's one service costs $120, so the listing starts at "$$".
    assert _level(client, shop) == "$$"
    client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Big job", "duration_minutes": 120, "price_cents": 90000})
    client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Bigger job", "duration_minutes": 120, "price_cents": 95000})
    assert _level(client, shop) == "$$$$"  # median of 12000, 90000, 95000 is 90000


def test_editing_a_price_or_removing_a_service_recomputes(client, shop):
    sid = shop["service_id"]
    client.patch(_url(shop, f"/services/{sid}"), headers=shop["owner"], json={"price_cents": 2000})
    assert _level(client, shop) == "$"
    other = client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Pricey", "duration_minutes": 60, "price_cents": 50000}).json()
    client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Pricey 2", "duration_minutes": 60, "price_cents": 60000})
    assert _level(client, shop) == "$$$$"
    # Retiring the expensive ones drops it back.
    client.delete(_url(shop, f"/services/{other['id']}"), headers=shop["owner"])
    listed = client.get(_url(shop, "/services"), headers=shop["owner"]).json()
    expensive = [s["id"] for s in listed if s["price_cents"] == 60000]
    client.delete(_url(shop, f"/services/{expensive[0]}"), headers=shop["owner"])
    assert _level(client, shop) == "$"


def test_price_on_request_and_free_services_are_ignored(client, shop):
    client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Free look", "duration_minutes": 15, "price_cents": 0})
    client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Quote", "duration_minutes": 30})
    assert _level(client, shop) == "$$"  # still just the $120 service


def test_an_owners_own_level_is_never_overwritten(client, shop):
    r = client.patch(_url(shop), headers=shop["owner"], json={"price_range": "$"})
    assert r.json()["price_range"] == "$" and r.json()["price_range_source"] == "owner"
    client.post(_url(shop, "/services"), headers=shop["owner"], json={"name": "Huge", "duration_minutes": 60, "price_cents": 500000})
    assert _level(client, shop) == "$"


def test_clearing_the_level_hands_it_back_to_the_services(client, shop):
    client.patch(_url(shop), headers=shop["owner"], json={"price_range": "$$$$"})
    r = client.patch(_url(shop), headers=shop["owner"], json={"price_range": None})
    assert r.json()["price_range"] == "$$" and r.json()["price_range_source"] == "services"


def test_a_listing_without_priced_services_has_no_level(client, db_factory):
    owner, _ = _user(client, "business_owner")
    created = client.post(
        "/api/v1/businesses",
        headers=owner,
        json={"name": "No Prices", "category_id": _any_category(db_factory), "city": "Vancouver"},
    ).json()
    assert created["price_range"] is None and created["price_range_source"] == "services"


def _any_category(db_factory):
    from app.models.category import Category

    with db_factory() as session:
        return session.scalars(select(Category.id)).first() or _make_category(session)


def _make_category(session):
    from app.models.category import Category

    cat = Category(name="Misc", slug="misc-price-test")
    session.add(cat)
    session.commit()
    return cat.id


def test_the_search_price_filter_now_finds_listings_priced_by_services(client, shop):
    """The point of all this: filtering by price matches listings whose level was derived."""
    assert _level(client, shop) == "$$"
    # Newest first, so listings other tests created cannot push this one off the page.
    found = client.get("/api/v1/businesses/search", params={"price": "$$", "sort": "newest", "limit": 100}).json()
    ids = {item["id"] for item in found["items"]}
    assert shop["bid"] in ids
    other = client.get("/api/v1/businesses/search", params={"price": "$$$$", "sort": "newest", "limit": 100}).json()
    assert shop["bid"] not in {item["id"] for item in other["items"]}


# ------------------------------------------------------------------ seed
def test_seed_derives_levels_for_demo_listings_but_respects_owner_choices(db):
    derived = _demo_listing(db, "dentists", booking_mode="none", price_range=None, price_range_source="services")
    chosen = _demo_listing(db, "salons", booking_mode="none", price_range="$$$$", price_range_source="owner")
    seed_booking(db)
    prices = [
        s.price_cents
        for s in db.scalars(select(BookableService).where(BookableService.business_id == derived.id))
    ]
    assert derived.price_range == price_level.level_for(prices) is not None
    assert chosen.price_range == "$$$$"
    seed_booking(db)  # idempotent
    assert db.get(Business, derived.id).price_range == price_level.level_for(prices)
