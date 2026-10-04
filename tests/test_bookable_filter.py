"""The "Bookable" search filter and badge."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update

from app.models.business import Business
from app.models.category import Category
from app.services.priority_search import is_bookable
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    _listing,
    _user,
    db_factory,
    emails,
    shop,
)


def _search(client, **params):
    # Newest first, so listings other tests created cannot push these off the page.
    params = {"sort": "newest", "page_size": 50, **params}
    return client.get("/api/v1/businesses/search", params=params).json()


def _ids(result):
    return {item["id"] for item in result["items"]}


def _by_id(result):
    return {item["id"]: item for item in result["items"]}


def _set(db_factory, business_id, **values):
    with db_factory() as db:
        db.execute(update(Business).where(Business.id == business_id).values(**values))
        db.commit()


def _move_category(db_factory, business_id, slug):
    with db_factory() as db:
        cat = db.scalar(select(Category).where(Category.slug == slug))
        if cat is None:
            cat = Category(name=slug.title(), slug=slug)
            db.add(cat)
            db.flush()
        db.execute(update(Business).where(Business.id == business_id).values(category_id=cat.id))
        db.commit()


def test_rule_in_python():
    assert is_bookable("external", "restaurants")
    assert is_bookable("request", "dentists")
    assert not is_bookable("request", "restaurants")  # category no longer takes requests
    assert not is_bookable("request", None)
    assert not is_bookable("none", "dentists")
    assert not is_bookable(None, "dentists")


def test_filter_and_badge(client, shop, db_factory):
    owner, email = _user(client, "business_owner")
    plain = _listing(db_factory, email)  # booking off
    external = _listing(db_factory, email)
    _set(db_factory, external, booking_mode="external", booking_url="https://example.com/book")

    everything = _by_id(_search(client))
    assert {shop["bid"], plain, external} <= set(everything)
    assert everything[shop["bid"]]["bookable"] is True and everything[shop["bid"]]["booking_mode"] == "request"
    assert everything[external]["bookable"] is True and everything[external]["booking_mode"] == "external"
    assert everything[plain]["bookable"] is False and everything[plain]["booking_mode"] == "none"

    only = _search(client, bookable="true")
    assert shop["bid"] in _ids(only) and external in _ids(only) and plain not in _ids(only)
    assert all(item["bookable"] for item in only["items"])  # nothing unbookable slipped through
    # The default is unchanged: not asking for it does not narrow anything.
    assert plain in _ids(_search(client, bookable="false"))


def test_request_mode_in_a_category_that_no_longer_books_is_not_bookable(client, shop, db_factory):
    _move_category(db_factory, shop["bid"], "restaurants")
    assert shop["bid"] not in _ids(_search(client, bookable="true"))
    assert _by_id(_search(client))[shop["bid"]]["bookable"] is False


def test_filter_combines_with_the_others(client, shop):
    # The fixture's one service ($120) puts the listing at "$$".
    assert shop["bid"] in _ids(_search(client, bookable="true", price="$$"))
    assert shop["bid"] not in _ids(_search(client, bookable="true", price="$$$$"))


def test_unlisted_businesses_stay_out_even_when_bookable(client, shop, db_factory):
    _set(db_factory, shop["bid"], is_active=False)
    assert shop["bid"] not in _ids(_search(client, bookable="true"))


def test_page_past_the_end_still_applies_the_filter(client, shop):
    result = _search(client, bookable="true", page=999)
    assert result["items"] == [] and result["total"] >= 1  # the count honours the filter
