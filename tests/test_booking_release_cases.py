"""The booking cases most likely to go wrong, checked before release.

1. two people booking the same time at the same moment make exactly one booking
2. bookings around the autumn clock change land at the right local time
3. confirming a request that now clashes gives a clear error
4. cancelling inside the cancellation window shows the policy (and still works)
5. requests older than 48 hours show as expired
6. an owner can never see or change another business's bookings

Some of these also exist, in simpler form, in test_booking_requests.py; the
versions here are the stricter ones (real concurrency, a full access matrix).
"""

from __future__ import annotations

import threading
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.models.booking import Booking
from app.services import booking_rules
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    WEEK,
    _book,
    _listing,
    _next,
    _user,
    db_factory,
    emails,
    shop,
)


def _make_shop(client, db_factory, name="Cleaning"):
    owner, email = _user(client, "business_owner")
    bid = _listing(db_factory, email)
    svc = client.post(
        f"/api/v1/businesses/{bid}/services", headers=owner, json={"name": name, "duration_minutes": 45}
    ).json()
    client.patch(f"/api/v1/businesses/{bid}", headers=owner, json={"booking_mode": "request"})
    return {"owner": owner, "bid": bid, "service_id": svc["id"], "owner_email": email}


def _accept_url(shop, booking):
    return f"/api/v1/businesses/{shop['bid']}/bookings/{booking['id']}/accept"


def _accept_body(booking):
    return {"proposed_time_id": booking["proposed_times"][0]["id"]}


# ------------------------------------------------ 1. the same time, at once
def test_database_alone_refuses_two_confirmed_bookings_in_the_same_slot(client, shop, db_factory):
    """Bypass the API entirely: the constraint is what holds under concurrency."""
    cust_a, _ = _user(client)
    cust_b, _ = _user(client)
    one, two = _book(client, shop, cust_a).json(), _book(client, shop, cust_b).json()
    start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=4)
    outcomes: list[str] = []
    barrier = threading.Barrier(2)

    def confirm(booking_id: int) -> None:
        with db_factory() as db:
            row = db.get(Booking, booking_id)
            row.status = "confirmed"
            row.confirmed_start, row.confirmed_end = start, start + timedelta(minutes=45)
            barrier.wait(timeout=10)  # both have staged the same slot; now both commit
            try:
                db.commit()
                outcomes.append("confirmed")
            except IntegrityError as error:
                db.rollback()
                outcomes.append(f"refused:{getattr(error.orig, 'pgcode', None)}")

    threads = [threading.Thread(target=confirm, args=(b["id"],)) for b in (one, two)]
    [t.start() for t in threads]
    [t.join(timeout=30) for t in threads]
    assert sorted(outcomes) == ["confirmed", "refused:23P01"], outcomes  # 23P01: exclusion_violation
    with db_factory() as db:
        assert db.scalar(
            select(func.count()).select_from(Booking).where(
                Booking.business_id == shop["bid"], Booking.status == "confirmed"
            )
        ) == 1


@pytest.mark.parametrize("round_", range(4))
def test_accepting_two_requests_for_one_slot_at_once_confirms_exactly_one(client, shop, db_factory, round_):
    """Two requests for one time, accepted simultaneously through the API."""
    cust_a, _ = _user(client)
    cust_b, _ = _user(client)
    day = _next(3 + round_)
    one = _book(client, shop, cust_a, day=day).json()
    two = _book(client, shop, cust_b, day=day).json()
    statuses: list[int] = []
    details: list[str] = []
    barrier = threading.Barrier(2)

    def accept(booking: dict) -> None:
        as_client = TestClient(app)  # its own client, so the two calls truly overlap
        barrier.wait(timeout=10)
        r = as_client.post(_accept_url(shop, booking), headers=shop["owner"], json=_accept_body(booking))
        statuses.append(r.status_code)
        details.append(r.text)

    threads = [threading.Thread(target=accept, args=(b,)) for b in (one, two)]
    [t.start() for t in threads]
    [t.join(timeout=60) for t in threads]
    assert sorted(statuses) == [200, 409], details
    assert any("clashes" in d for d in details)
    with db_factory() as db:
        rows = db.scalars(select(Booking.status).where(Booking.id.in_([one["id"], two["id"]]))).all()
    assert sorted(rows) == ["confirmed", "requested"]  # the loser stays a request, not lost


def test_two_copies_of_one_request_sent_at_once_make_one_booking(client, shop, db_factory):
    cust, email = _user(client)
    body = {
        "business_id": shop["bid"], "service_id": shop["service_id"], "consent_shared": True,
        "proposals": [{"date": str(_next()), "time": "10:00"}],
    }
    statuses: list[int] = []
    barrier = threading.Barrier(2)

    def send() -> None:
        as_client = TestClient(app)
        barrier.wait(timeout=10)
        r = as_client.post("/api/v1/bookings", json=body, headers={**cust, "Idempotency-Key": "race-key-12345"})
        statuses.append(r.status_code)

    threads = [threading.Thread(target=send) for _ in range(2)]
    [t.start() for t in threads]
    [t.join(timeout=60) for t in threads]
    assert sorted(statuses) == [200, 201], statuses  # one created, one replayed
    with db_factory() as db:
        count = db.scalar(select(func.count()).select_from(Booking).where(Booking.idempotency_key == "race-key-12345"))
    assert count == 1


# ---------------------------------------------------- 2. around the clock change
@pytest.mark.parametrize("zone_name", ["America/Vancouver", "America/Edmonton", "America/Toronto", "America/Regina"])
def test_conversion_matches_the_zone_database_through_the_autumn_change(zone_name):
    """Every day from 25 Oct to 8 Nov 2026, at several hours: UTC must equal what tzdata says."""
    zone = ZoneInfo(zone_name)
    start = date(2026, 10, 25)
    for offset in range(15):
        day = start + timedelta(days=offset)
        for hour in (0, 3, 9, 12, 18, 23):
            expected = datetime(day.year, day.month, day.day, hour, tzinfo=zone).astimezone(timezone.utc)
            assert booking_rules.to_utc(day, time(hour), zone) == expected, (zone_name, day, hour)


def _clock_change(zone: ZoneInfo, start: date, *, back: bool) -> date | None:
    """The first day from `start`, within a year, on which the zone's clocks go back
    (or forward), read from the zone database rather than assumed.

    Provinces change their rules - Alberta and BC stopped falling back in 2026 -
    so a hard-coded date goes stale when tzdata does.
    """
    for d in range(1, 366):
        day = start + timedelta(days=d)
        before = datetime.combine(day - timedelta(days=1), time(12), tzinfo=zone).utcoffset()
        after = datetime.combine(day, time(12), tzinfo=zone).utcoffset()
        if after != before and (after < before) == back:
            return day
    return None


def _ambiguous_or_missing(zone: ZoneInfo, day: date, *, repeated: bool) -> time:
    """A half-hour on `day` that happens twice (fall) or not at all (spring)."""
    for minutes in range(0, 24 * 60, 30):
        wall = time(minutes // 60, minutes % 60)
        first = datetime.combine(day, wall, tzinfo=zone)
        if repeated and first.utcoffset() != first.replace(fold=1).utcoffset():
            return wall
        if not repeated and first.astimezone(timezone.utc).astimezone(zone).time() != wall:
            return wall
    raise AssertionError(f"no {'repeated' if repeated else 'missing'} time in {zone} on {day}")


@pytest.mark.parametrize("zone_name", ["America/Vancouver", "America/Edmonton", "America/Toronto", "America/Regina"])
def test_ten_am_lands_where_the_zone_rules_say_across_the_autumn(zone_name):
    """10:00 the day before and the day after the autumn change, wherever the zone has one."""
    zone = ZoneInfo(zone_name)
    change = _clock_change(zone, date(2026, 9, 1), back=True)
    # A zone that no longer falls back is still checked, across the same weekend.
    before, after = (change - timedelta(days=1), change + timedelta(days=1)) if change else (date(2026, 10, 31), date(2026, 11, 2))
    now = datetime.combine(before - timedelta(days=7), time(12), tzinfo=timezone.utc)

    def at(day):
        return booking_rules.build_proposal(
            style="appointment", day=day, wall=time(10, 0), part=None, duration_minutes=60,
            opening_hours=None, zone=zone, now=now,
        ).starts_at

    for day in (before, after):
        assert at(day) == datetime.combine(day, time(10, 0), tzinfo=zone).astimezone(timezone.utc), day
    # The same wall-clock time two days apart is 48 hours plus the hour the clocks
    # went back - 49 across a change, 48 where there is none.
    shift = datetime.combine(before, time(10), tzinfo=zone).utcoffset() - datetime.combine(after, time(10), tzinfo=zone).utcoffset()
    assert at(after) - at(before) == timedelta(days=2) + shift


def test_the_repeated_hour_resolves_to_its_first_occurrence_and_a_whole_visit_still_fits():
    zone = ZoneInfo("America/Toronto")
    change = _clock_change(zone, date(2026, 9, 1), back=True)
    if change is None:
        pytest.skip("Ontario no longer falls back")
    wall = _ambiguous_or_missing(zone, change, repeated=True)

    first = booking_rules.to_utc(change, wall, zone)

    # The earlier of the two (daylight time), not the later one.
    assert first == datetime.combine(change, wall, tzinfo=zone).astimezone(timezone.utc)
    assert first.astimezone(zone).utcoffset() == datetime.combine(change, wall, tzinfo=zone).utcoffset()
    assert first < datetime.combine(change, wall, tzinfo=zone).replace(fold=1).astimezone(timezone.utc)


def test_a_spring_gap_time_is_refused_not_shifted():
    zone = ZoneInfo("America/Toronto")
    change = _clock_change(zone, date(2026, 12, 1), back=False)
    if change is None:
        pytest.skip("Ontario no longer springs forward")
    wall = _ambiguous_or_missing(zone, change, repeated=False)
    with pytest.raises(booking_rules.BookingRuleError, match="does not exist"):
        booking_rules.to_utc(change, wall, zone)


def test_through_the_api_a_booking_after_the_next_clock_change_is_stored_at_the_right_instant(client, shop):
    """Uses whatever clock change falls in the next 60 days, in the first Canadian
    zone that has one (skips if none does)."""
    today = datetime.now(timezone.utc).date()

    def next_change(zone):
        return next(
            (
                today + timedelta(days=d)
                for d in range(3, 58)
                if datetime.combine(today + timedelta(days=d), time(12), tzinfo=zone).utcoffset()
                != datetime.combine(today + timedelta(days=d - 1), time(12), tzinfo=zone).utcoffset()
            ),
            None,
        )

    found = next(
        (
            (name, change)
            for name in ("America/Edmonton", "America/Toronto", "America/Halifax", "America/Vancouver")
            if (change := next_change(ZoneInfo(name))) is not None
        ),
        None,
    )
    if found is None:
        pytest.skip("no clock change in Canada within the next 60 days")
    zone_name, change = found
    zone = ZoneInfo(zone_name)
    client.patch(f"/api/v1/businesses/{shop['bid']}", headers=shop["owner"], json={"timezone": zone_name})
    cust, _ = _user(client)
    before, after = change - timedelta(days=1), change + timedelta(days=1)
    for day in (before, after):
        booking = _book(client, shop, cust, day=day).json()
        assert booking["timezone"] == zone_name
        expected = datetime.combine(day, time(10, 0), tzinfo=zone).astimezone(timezone.utc)
        assert datetime.fromisoformat(booking["proposed_times"][0]["starts_at"]) == expected
        client.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=cust, json={})


# ---------------------------------------------- 3. confirming a request that now clashes
def test_confirming_a_request_that_now_clashes_names_the_problem_and_changes_nothing(client, shop, db_factory):
    cust_a, _ = _user(client)
    cust_b, _ = _user(client)
    day = _next(5)
    first = _book(client, shop, cust_a, day=day).json()
    second = _book(client, shop, cust_b, day=day).json()
    assert client.post(_accept_url(shop, first), headers=shop["owner"], json=_accept_body(first)).status_code == 200
    clash = client.post(_accept_url(shop, second), headers=shop["owner"], json=_accept_body(second))
    assert clash.status_code == 409
    assert clash.json()["detail"] == "That time clashes with another confirmed booking. Choose a different time."
    with db_factory() as db:
        row = db.get(Booking, second["id"])
        assert row.status == "requested" and row.confirmed_start is None  # untouched, still answerable
    # And the owner can recover by choosing one of the other times the customer offered.
    third = client.post(
        "/api/v1/bookings", headers=cust_b,
        json={"business_id": shop["bid"], "service_id": shop["service_id"], "consent_shared": True,
              "proposals": [{"date": str(day), "time": "10:00"}, {"date": str(day), "time": "14:00"}]},
    ).json()
    pick = next(p for p in third["proposed_times"] if p["starts_at"] != first["proposed_times"][0]["starts_at"])
    assert client.post(_accept_url(shop, third), headers=shop["owner"], json={"proposed_time_id": pick["id"]}).status_code == 200


def test_an_overlap_that_is_not_an_exact_match_also_clashes(client, shop):
    """10:00-10:45 confirmed; a request for 10:30 (inside it) must be refused, 10:45 must not."""
    cust, _ = _user(client)
    base = _book(client, shop, cust, day=_next(6), at="10:00").json()
    client.post(_accept_url(shop, base), headers=shop["owner"], json=_accept_body(base))
    inside = _book(client, shop, cust, day=_next(6), at="10:30").json()
    assert client.post(_accept_url(shop, inside), headers=shop["owner"], json=_accept_body(inside)).status_code == 409
    adjacent = _book(client, shop, cust, day=_next(6), at="10:45").json()
    assert client.post(_accept_url(shop, adjacent), headers=shop["owner"], json=_accept_body(adjacent)).status_code == 200


# --------------------------------------- 4. cancelling inside the cancellation window
def _confirm_starting_in(client, shop, cust, db_factory, hours):
    booking = _book(client, shop, cust).json()
    client.post(_accept_url(shop, booking), headers=shop["owner"], json=_accept_body(booking))
    start = datetime.now(timezone.utc) + timedelta(hours=hours)
    with db_factory() as db:
        db.execute(update(Booking).where(Booking.id == booking["id"]).values(
            confirmed_start=start, confirmed_end=start + timedelta(minutes=45)))
        db.commit()
    return booking


def test_inside_the_window_the_booking_carries_the_policy_and_the_flag(client, shop, db_factory):
    cust, _ = _user(client)
    booking = _confirm_starting_in(client, shop, cust, db_factory, hours=5)  # window is 24 hours
    seen = client.get("/api/v1/bookings/mine", headers=cust).json()[0]
    assert seen["inside_cancellation_window"] is True
    assert seen["cancellation_policy"] == "24h notice please"
    # It never blocks: there are no fees until real payments exist.
    done = client.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=cust, json={})
    assert done.status_code == 200 and done.json()["status"] == "cancelled"


def test_outside_the_window_the_flag_is_off_but_the_policy_is_still_there(client, shop, db_factory):
    cust, _ = _user(client)
    _confirm_starting_in(client, shop, cust, db_factory, hours=72)
    seen = client.get("/api/v1/bookings/mine", headers=cust).json()[0]
    assert seen["inside_cancellation_window"] is False
    assert seen["cancellation_policy"] == "24h notice please"


def test_the_window_follows_the_owners_setting(client, shop, db_factory):
    client.patch(f"/api/v1/businesses/{shop['bid']}", headers=shop["owner"], json={"cancellation_window_hours": 72})
    cust, _ = _user(client)
    _confirm_starting_in(client, shop, cust, db_factory, hours=48)
    assert client.get("/api/v1/bookings/mine", headers=cust).json()[0]["inside_cancellation_window"] is True


def test_the_owner_sees_the_same_policy_on_the_booking(client, shop, db_factory):
    cust, _ = _user(client)
    _confirm_starting_in(client, shop, cust, db_factory, hours=5)
    row = client.get(f"/api/v1/businesses/{shop['bid']}/bookings", headers=shop["owner"]).json()[0]
    assert row["cancellation_policy"] == "24h notice please"


# ------------------------------------------------------ 5. older than 48 hours
@pytest.mark.parametrize("age_hours, expected", [(47, "requested"), (49, "expired")])
def test_the_48_hour_edge(client, shop, db_factory, age_hours, expected):
    cust, _ = _user(client)
    booking = _book(client, shop, cust).json()
    with db_factory() as db:
        db.execute(update(Booking).where(Booking.id == booking["id"]).values(
            created_at=datetime.now(timezone.utc) - timedelta(hours=age_hours)))
        db.commit()
    assert client.get("/api/v1/bookings/mine", headers=cust).json()[0]["status"] == expected
    as_owner = client.get(f"/api/v1/businesses/{shop['bid']}/bookings", headers=shop["owner"]).json()
    assert as_owner[0]["status"] == expected  # the owner sees the same thing


def test_an_expired_request_cannot_be_accepted_or_declined_but_is_not_deleted(client, shop, db_factory):
    cust, _ = _user(client)
    booking = _book(client, shop, cust).json()
    with db_factory() as db:
        db.execute(update(Booking).where(Booking.id == booking["id"]).values(
            created_at=datetime.now(timezone.utc) - timedelta(hours=60)))
        db.commit()
    assert client.post(_accept_url(shop, booking), headers=shop["owner"], json=_accept_body(booking)).status_code == 409
    decline = client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{booking['id']}/decline", headers=shop["owner"], json={"message": "late"}
    )
    assert decline.status_code == 409
    assert client.get("/api/v1/bookings/mine", headers=cust).json()[0]["status"] == "expired"


def test_a_request_whose_suggested_times_have_all_passed_expires_even_if_young(client, shop, db_factory):
    from app.models.booking import BookingProposedTime

    cust, _ = _user(client)
    booking = _book(client, shop, cust).json()
    long_ago = datetime.now(timezone.utc) - timedelta(days=1)
    with db_factory() as db:
        db.execute(update(BookingProposedTime).where(BookingProposedTime.booking_id == booking["id"]).values(
            starts_at=long_ago, ends_at=long_ago + timedelta(minutes=45)))
        db.commit()
    assert client.get("/api/v1/bookings/mine", headers=cust).json()[0]["status"] == "expired"


# ------------------------------------------------ 6. never another business's bookings
def test_an_owner_cannot_see_or_change_another_businesses_bookings(client, db_factory):
    mine = _make_shop(client, db_factory)
    theirs = _make_shop(client, db_factory)
    cust, _ = _user(client)
    target = _book(client, theirs, cust).json()
    confirmed = _book(client, theirs, cust, day=_next(5)).json()
    client.post(_accept_url(theirs, confirmed), headers=theirs["owner"], json=_accept_body(confirmed))
    intruder = mine["owner"]
    base = f"/api/v1/businesses/{theirs['bid']}"

    # Their business, their bookings: every route refuses.
    assert client.get(f"{base}/bookings", headers=intruder).status_code == 403
    assert client.get(f"{base}/bookings?status=confirmed", headers=intruder).status_code == 403
    for action, body in (
        ("accept", _accept_body(target)), ("decline", {"message": "x"}), ("cancel", {"reason": "x"}),
        ("complete", {}), ("no-show", {}),
    ):
        r = client.post(f"{base}/bookings/{target['id']}/{action}", headers=intruder, json=body)
        assert r.status_code == 403, (action, r.status_code)
    # Their services.
    assert client.get(f"{base}/services", headers=intruder).status_code == 403
    assert client.post(f"{base}/services", headers=intruder, json={"name": "x", "duration_minutes": 30}).status_code == 403
    assert client.patch(f"{base}/services/{theirs['service_id']}", headers=intruder, json={"name": "hijack"}).status_code == 403
    assert client.delete(f"{base}/services/{theirs['service_id']}", headers=intruder).status_code == 403
    # Their listing's booking settings.
    assert client.patch(base, headers=intruder, json={"booking_mode": "none"}).status_code == 403
    # A booking looked up directly, as an outsider.
    assert client.get(f"/api/v1/bookings/{target['id']}", headers=intruder).status_code == 404
    assert client.post(f"/api/v1/bookings/{target['id']}/cancel", headers=intruder, json={}).status_code == 404

    # Nothing changed.
    with db_factory() as db:
        assert db.get(Booking, target["id"]).status == "requested"
        assert db.get(Booking, confirmed["id"]).status == "confirmed"


def test_an_owner_cannot_reach_another_businesses_booking_through_their_own_business_path(client, db_factory):
    """The sneaky one: own business id in the URL, someone else's booking id."""
    mine = _make_shop(client, db_factory)
    theirs = _make_shop(client, db_factory)
    cust, _ = _user(client)
    target = _book(client, theirs, cust).json()
    base = f"/api/v1/businesses/{mine['bid']}/bookings/{target['id']}"
    for action, body in (
        ("accept", _accept_body(target)), ("decline", {"message": "x"}), ("cancel", {"reason": "x"}),
        ("complete", {}), ("no-show", {}),
    ):
        assert client.post(f"{base}/{action}", headers=mine["owner"], json=body).status_code == 404, action
    # Their booking never appears in my list either.
    assert target["id"] not in {b["id"] for b in client.get(f"/api/v1/businesses/{mine['bid']}/bookings", headers=mine["owner"]).json()}
    with db_factory() as db:
        assert db.get(Booking, target["id"]).status == "requested"


def test_a_customer_sees_only_their_own_bookings(client, shop):
    a, _ = _user(client)
    b, _ = _user(client)
    mine = _book(client, shop, a).json()
    theirs = _book(client, shop, b, day=_next(5)).json()
    assert {x["id"] for x in client.get("/api/v1/bookings/mine", headers=a).json()} == {mine["id"]}
    assert client.get(f"/api/v1/bookings/{theirs['id']}", headers=a).status_code == 404
    assert client.post(f"/api/v1/bookings/{theirs['id']}/cancel", headers=a, json={}).status_code == 404


def test_a_customer_account_cannot_use_the_owner_routes_at_all(client, shop):
    cust, _ = _user(client)
    base = f"/api/v1/businesses/{shop['bid']}"
    assert client.get(f"{base}/bookings", headers=cust).status_code == 403
    assert client.get(f"{base}/services", headers=cust).status_code == 403


def test_nothing_is_reachable_without_signing_in(client, shop):
    base = f"/api/v1/businesses/{shop['bid']}"
    assert client.get(f"{base}/bookings").status_code == 401
    assert client.get(f"{base}/services").status_code == 401
    assert client.get("/api/v1/bookings/mine").status_code == 401
    assert client.get("/api/v1/admin/bookings").status_code == 401
