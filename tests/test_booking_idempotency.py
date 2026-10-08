"""Booking requests: the Idempotency-Key header.

Reuses the fixtures and helpers from test_booking_requests so the two files
describe the same shop.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models.booking import Booking
from app.models.user import User
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    _book,
    _next,
    _user,
    db_factory,
    emails,
    shop,
)


def _count(db_factory, customer_email) -> int:
    with db_factory() as db:
        uid = db.scalar(select(User.id).where(User.email == customer_email))
        return db.scalar(select(func.count()).select_from(Booking).where(Booking.customer_id == uid)) or 0


def _post_with_key(client, shop, headers, key, **extra):
    body = {
        "business_id": shop["bid"],
        "service_id": shop["service_id"],
        "consent_shared": True,
        "proposals": [{"date": str(_next()), "time": "10:00"}],
        **extra,
    }
    return client.post("/api/v1/bookings", headers={**headers, "Idempotency-Key": key}, json=body)


def test_same_key_replays_the_first_booking(client, shop, db_factory, emails):
    cust, email = _user(client)
    first = _post_with_key(client, shop, cust, "key-abcdefgh-1")
    assert first.status_code == 201
    emails.clear()
    again = _post_with_key(client, shop, cust, "key-abcdefgh-1")
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert _count(db_factory, email) == 1
    assert emails == []  # a replay does not email anyone again


def test_replay_still_works_after_the_request_was_decided(client, shop):
    cust, _ = _user(client)
    first = _post_with_key(client, shop, cust, "key-abcdefgh-2").json()
    client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{first['id']}/decline",
        headers=shop["owner"],
        json={"message": "no"},
    )
    again = _post_with_key(client, shop, cust, "key-abcdefgh-2")
    assert again.status_code == 200 and again.json()["status"] == "declined"


def test_replay_is_not_blocked_by_the_waiting_request_cap(client, shop):
    cust, _ = _user(client)
    for i in range(2):
        assert _book(client, shop, cust, day=_next(3 + i)).status_code == 201
    third = {"proposals": [{"date": str(_next(9)), "time": "10:00"}]}
    assert _post_with_key(client, shop, cust, "key-abcdefgh-3", **third).status_code == 201
    # A fourth *new* request would be refused, but the replay of the third is not.
    assert _post_with_key(client, shop, cust, "key-abcdefgh-3", **third).status_code == 200


def test_key_reused_for_a_different_request_is_refused(client, shop):
    cust, _ = _user(client)
    assert _post_with_key(client, shop, cust, "key-abcdefgh-4").status_code == 201
    other = _post_with_key(client, shop, cust, "key-abcdefgh-4", note="something else")
    assert other.status_code == 409 and "different request" in other.json()["detail"]


def test_keys_are_per_customer(client, shop):
    a, _ = _user(client)
    b, _ = _user(client)
    first = _post_with_key(client, shop, a, "key-abcdefgh-5").json()
    second = _post_with_key(client, shop, b, "key-abcdefgh-5")
    assert second.status_code == 201 and second.json()["id"] != first["id"]


@pytest.mark.parametrize("bad", ["short", "has spaces in it", "x" * 65, "bad/chars/here"])
def test_malformed_keys_are_refused(client, shop, bad):
    cust, _ = _user(client)
    assert _post_with_key(client, shop, cust, bad).status_code == 422


def test_no_key_still_creates_each_time(client, shop, db_factory):
    cust, email = _user(client)
    assert _book(client, shop, cust, day=_next(3)).status_code == 201
    assert _book(client, shop, cust, day=_next(3)).status_code == 201
    assert _count(db_factory, email) == 2


def test_two_racing_copies_make_one_booking(client, shop, db_factory, monkeypatch):
    """Both copies pass the lookup; the unique index lets one in, the other replays it."""
    from app.api.v1 import bookings as bookings_api

    cust, email = _user(client)
    real = bookings_api._replay
    first = _post_with_key(client, shop, cust, "key-abcdefgh-6")
    assert first.status_code == 201

    calls = {"n": 0}

    def blind_first_lookup(*args, **kwargs):
        calls["n"] += 1
        return None if calls["n"] == 1 else real(*args, **kwargs)

    monkeypatch.setattr(bookings_api, "_replay", blind_first_lookup)
    second = _post_with_key(client, shop, cust, "key-abcdefgh-6")
    assert second.status_code == 200 and second.json()["id"] == first.json()["id"]
    assert _count(db_factory, email) == 1
