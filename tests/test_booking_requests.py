"""Booking phase 1: requests, accept/decline/cancel, expiry, the no-overlap rule."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from app.models.booking import Booking
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.user import User
from app.models.verification import BusinessVerification, VerificationStatus
from app.services import booking_notify, booking_rules
from zoneinfo import ZoneInfo

PASSWORD = "bookingtest123"
WEEK = {d: [["09:00", "17:00"]] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
# London, not a Canadian zone, on purpose: its clock changes are long settled, so
# these tests do not depend on what tzdata currently says about BC or Ontario.
ZONE = ZoneInfo("Europe/London")


# ------------------------------------------------------------ pure rules
def _proposal(**kw):
    args = dict(
        style="appointment", day=date(2030, 3, 5), wall=time(10, 0), part=None,
        duration_minutes=60, opening_hours=WEEK, zone=ZONE,
        now=datetime(2030, 3, 1, tzinfo=timezone.utc),
    )
    args.update(kw)
    return booking_rules.build_proposal(**args)


def test_appointment_becomes_utc_in_the_business_zone():
    p = _proposal()
    assert p.starts_at == datetime(2030, 3, 5, 10, 0, tzinfo=timezone.utc)  # 10:00 GMT
    assert p.ends_at - p.starts_at == timedelta(minutes=60)


def test_summer_time_uses_the_right_offset():
    p = _proposal(day=date(2030, 7, 9), now=datetime(2030, 7, 1, tzinfo=timezone.utc))
    assert p.starts_at == datetime(2030, 7, 9, 9, 0, tzinfo=timezone.utc)  # 10:00 BST


@pytest.mark.parametrize(
    "kw, fragment",
    [
        (dict(wall=time(8, 0)), "opening hours"),
        (dict(wall=time(16, 30)), "opening hours"),  # 60 min would run past 17:00
        (dict(opening_hours={**WEEK, "tue": []}), "closed"),
        (dict(now=datetime(2030, 3, 5, 17, 30, tzinfo=timezone.utc)), "too soon"),
        (dict(now=datetime(2029, 1, 1, tzinfo=timezone.utc)), "too far"),
        (dict(wall=None), "Choose a time"),
        (dict(day=date(2030, 3, 31), wall=time(1, 30)), "does not exist"),  # spring-forward gap
    ],
)
def test_appointment_rules_refuse(kw, fragment):
    if "day" in kw:
        kw = {**kw, "opening_hours": None}
    with pytest.raises(booking_rules.BookingRuleError, match=fragment):
        _proposal(**kw)


def test_window_uses_part_of_day_and_checks_the_day_is_open():
    p = _proposal(style="window", wall=None, part="morning")
    assert (p.starts_at.astimezone(ZONE).time(), p.ends_at.astimezone(ZONE).time()) == (time(8), time(12))
    hours = {**WEEK, "tue": [["13:00", "17:00"]]}
    with pytest.raises(booking_rules.BookingRuleError, match="not open in the morning"):
        _proposal(style="window", wall=None, part="morning", opening_hours=hours)
    with pytest.raises(booking_rules.BookingRuleError):
        _proposal(style="window", wall=None, part=None)


def test_no_listed_hours_means_no_restriction():
    assert _proposal(opening_hours=None, wall=time(23, 0))


def test_proposal_count_and_duplicates():
    p = _proposal()
    with pytest.raises(booking_rules.BookingRuleError):
        booking_rules.check_proposals([])
    with pytest.raises(booking_rules.BookingRuleError):
        booking_rules.check_proposals([p, p])
    with pytest.raises(booking_rules.BookingRuleError):
        booking_rules.check_proposals([_proposal(wall=time(h)) for h in (9, 10, 11, 12)])
    booking_rules.check_proposals([_proposal(wall=time(h)) for h in (9, 10, 11)])


def test_window_arrival_must_be_inside_the_window():
    s, e = datetime(2030, 3, 5, 16, tzinfo=timezone.utc), datetime(2030, 3, 5, 20, tzinfo=timezone.utc)
    start, end = booking_rules.accepted_slot(
        style="window", proposed_start=s, proposed_end=e, duration_minutes=90,
        chosen_start=s + timedelta(hours=1),
    )
    assert end - start == timedelta(minutes=90)
    with pytest.raises(booking_rules.BookingRuleError):
        booking_rules.accepted_slot(
            style="window", proposed_start=s, proposed_end=e, duration_minutes=90, chosen_start=e
        )


def test_province_zones_and_overrides():
    assert str(booking_rules.zone_for(None, "AB")) == "America/Edmonton"
    assert str(booking_rules.zone_for("America/Regina", "AB")) == "America/Regina"
    assert str(booking_rules.zone_for("Nowhere/Land", "ON")) == "America/Toronto"


def test_ics_is_escaped_and_utc():
    b = Booking(
        id=7, service_name="Cut, colour; wash", confirmed_start=datetime(2030, 3, 5, 18, tzinfo=timezone.utc),
        confirmed_end=datetime(2030, 3, 5, 19, tzinfo=timezone.utc),
    )
    biz = Business(name="Salon\nX", address="1 Main St", city="Vancouver", province="BC")
    text = booking_notify.build_ics(b, biz).decode()
    assert "DTSTART:20300305T180000Z" in text
    assert "Cut\\, colour\\; wash" in text and "Salon\\nX" in text
    assert text.count("BEGIN:VEVENT") == 1 and text.endswith("\r\n")


# ------------------------------------------------------------- API flow
@pytest.fixture()
def db_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture()
def emails(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(booking_notify, "send_email", lambda **kw: sent.append(kw) or True)
    return sent


def _category(db_factory, slug: str) -> int:
    with db_factory() as db:
        cat = db.scalar(select(Category).where(Category.slug == slug))
        if cat is None:
            cat = Category(name=slug.title(), slug=slug)
            db.add(cat)
            db.commit()
        return cat.id


def _user(client, role="customer", name="Casey Customer"):
    email = f"u-{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/v1/signup", json={"name": name, "email": email, "password": PASSWORD, "role": role})
    token = client.post("/api/v1/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, email


def _owner_id(db_factory, email):
    with db_factory() as db:
        return db.scalar(select(User.id).where(User.email == email))


def _listing(db_factory, owner_email, category_slug="dentists", hours=WEEK):
    cid = _category(db_factory, category_slug)
    with db_factory() as db:
        business = Business(
            name="Bright Smile", slug=f"bs-{uuid.uuid4().hex[:8]}", category_id=cid, city="Vancouver",
            province="BC", status=BusinessStatus.approved, is_active=True, verified=True,
            owner_id=db.scalar(select(User.id).where(User.email == owner_email)),
            opening_hours=hours, email="front-desk@example.com", cancellation_policy="24h notice please",
        )
        db.add(business)
        db.flush()
        db.add(BusinessVerification(
            business_id=business.id, email="k@example.ca", mobile_number="6045550100",
            status=VerificationStatus.verified,
        ))
        db.commit()
        return business.id


def _next(weekday_offset=3) -> date:
    return (datetime.now(timezone.utc) + timedelta(days=weekday_offset)).date()


@pytest.fixture()
def shop(client, db_factory):
    owner, owner_email = _user(client, "business_owner", "Olivia Owner")
    bid = _listing(db_factory, owner_email)
    svc = client.post(
        f"/api/v1/businesses/{bid}/services", headers=owner,
        json={"name": "Cleaning", "duration_minutes": 45, "price_cents": 12000},
    )
    assert svc.status_code == 201, svc.text
    on = client.patch(f"/api/v1/businesses/{bid}", headers=owner, json={"booking_mode": "request"})
    assert on.status_code == 200, on.text
    return {"owner": owner, "bid": bid, "service_id": svc.json()["id"], "owner_email": owner_email}


def _book(client, shop, headers, day=None, at="10:00", **extra):
    body = {
        "business_id": shop["bid"], "service_id": shop["service_id"],
        "proposals": [{"date": str(day or _next()), "time": at}],
        "consent_shared": True, **extra,
    }
    return client.post("/api/v1/bookings", headers=headers, json=body)


def test_request_mode_needs_a_service_and_a_bookable_category(client, db_factory):
    owner, email = _user(client, "business_owner")
    bid = _listing(db_factory, email)
    r = client.patch(f"/api/v1/businesses/{bid}", headers=owner, json={"booking_mode": "request"})
    assert r.status_code == 422 and "service" in r.text
    other = _listing(db_factory, email, category_slug="restaurants")
    client.post(f"/api/v1/businesses/{other}/services", headers=owner, json={"name": "Table", "duration_minutes": 60})
    r = client.patch(f"/api/v1/businesses/{other}", headers=owner, json={"booking_mode": "request"})
    assert r.status_code == 422 and "category" in r.text


def test_booking_info_lists_services_and_rules(client, shop):
    info = client.get(f"/api/v1/businesses/{shop['bid']}/booking-info").json()
    assert info["style"] == "appointment" and info["timezone"] == "America/Vancouver"
    assert [s["name"] for s in info["services"]] == ["Cleaning"]
    assert info["cancellation_policy"] == "24h notice please"


def test_full_request_accept_cancel_flow(client, shop, emails):
    cust, cust_email = _user(client)
    r = _book(client, shop, cust, note="  first   visit ", phone="6045550123")
    assert r.status_code == 201, r.text
    booking = r.json()
    assert booking["status"] == "requested" and booking["note"] == "first visit"
    assert booking["expires_at"] and len(booking["proposed_times"]) == 1
    assert {m["to"] for m in emails} == {cust_email, "front-desk@example.com"}  # customer + owner

    pending = client.get(f"/api/v1/businesses/{shop['bid']}/bookings", headers=shop["owner"]).json()
    assert pending[0]["id"] == booking["id"] and pending[0]["customer_phone"] == "6045550123"

    emails.clear()
    pt = booking["proposed_times"][0]["id"]
    ok = client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{booking['id']}/accept", headers=shop["owner"],
        json={"proposed_time_id": pt},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "confirmed" and ok.json()["confirmed_start"]
    (mail,) = emails
    assert mail["to"] == cust_email and mail["attachments"][0][0] == "booking.ics"
    assert b"BEGIN:VEVENT" in mail["attachments"][0][2]

    emails.clear()
    gone = client.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=cust, json={"reason": "plans changed"})
    assert gone.status_code == 200 and gone.json()["status"] == "cancelled"
    assert gone.json()["cancelled_by"] == "customer"
    assert {m["to"] for m in emails} == {cust_email, "front-desk@example.com"}
    assert client.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=cust, json={}).status_code == 409


def test_database_refuses_two_confirmed_bookings_in_the_same_slot(client, shop):
    a, _ = _user(client)
    b, _ = _user(client)
    first, second = _book(client, shop, a).json(), _book(client, shop, b).json()
    accept = lambda bk: client.post(  # noqa: E731
        f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}/accept", headers=shop["owner"],
        json={"proposed_time_id": bk["proposed_times"][0]["id"]},
    )
    assert accept(first).status_code == 200
    clash = accept(second)
    assert clash.status_code == 409 and "clashes" in clash.json()["detail"]
    # The loser is still a pending request, and a different slot works.
    later = _book(client, shop, b, at="14:00").json()
    assert accept(later).status_code == 200


def test_overlap_is_per_business(client, db_factory, shop):
    owner2, email2 = _user(client, "business_owner")
    bid2 = _listing(db_factory, email2)
    s2 = client.post(f"/api/v1/businesses/{bid2}/services", headers=owner2, json={"name": "X", "duration_minutes": 45}).json()
    client.patch(f"/api/v1/businesses/{bid2}", headers=owner2, json={"booking_mode": "request"})
    cust, _ = _user(client)
    one = _book(client, shop, cust).json()
    two = client.post("/api/v1/bookings", headers=cust, json={
        "business_id": bid2, "service_id": s2["id"], "consent_shared": True,
        "proposals": [{"date": str(_next()), "time": "10:00"}],
    }).json()
    for bid, bk, hdr in ((shop["bid"], one, shop["owner"]), (bid2, two, owner2)):
        r = client.post(f"/api/v1/businesses/{bid}/bookings/{bk['id']}/accept", headers=hdr,
                        json={"proposed_time_id": bk["proposed_times"][0]["id"]})
        assert r.status_code == 200


def test_decline_sends_the_message(client, shop, emails):
    cust, cust_email = _user(client)
    bk = _book(client, shop, cust).json()
    emails.clear()
    r = client.post(f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}/decline", headers=shop["owner"],
                    json={"message": "Try Thursday?"})
    assert r.json()["status"] == "declined"
    assert "Try Thursday?" in emails[0]["body"] and emails[0]["to"] == cust_email
    again = client.post(f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}/accept", headers=shop["owner"],
                        json={"proposed_time_id": bk["proposed_times"][0]["id"]})
    assert again.status_code == 409


def test_unanswered_request_expires_when_read(client, shop, db_factory):
    cust, _ = _user(client)
    bk = _book(client, shop, cust).json()
    with db_factory() as db:
        db.execute(update(Booking).where(Booking.id == bk["id"]).values(created_at=datetime.now(timezone.utc) - timedelta(hours=49)))
        db.commit()
    mine = client.get("/api/v1/bookings/mine", headers=cust).json()
    assert mine[0]["status"] == "expired"
    r = client.post(f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}/accept", headers=shop["owner"],
                    json={"proposed_time_id": bk["proposed_times"][0]["id"]})
    assert r.status_code == 409 and "expired" in r.json()["detail"]


def test_old_confirmed_booking_is_treated_as_completed(client, shop, db_factory):
    cust, _ = _user(client)
    bk = _book(client, shop, cust).json()
    client.post(f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}/accept", headers=shop["owner"],
                json={"proposed_time_id": bk["proposed_times"][0]["id"]})
    past = datetime.now(timezone.utc) - timedelta(days=5)
    with db_factory() as db:
        db.execute(update(Booking).where(Booking.id == bk["id"]).values(
            confirmed_start=past, confirmed_end=past + timedelta(minutes=45)))
        db.commit()
    assert client.get("/api/v1/bookings/mine", headers=cust).json()[0]["status"] == "completed"


def test_owner_closes_out_and_cannot_before_the_visit(client, shop, db_factory):
    cust, _ = _user(client)
    bk = _book(client, shop, cust).json()
    base = f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}"
    client.post(f"{base}/accept", headers=shop["owner"], json={"proposed_time_id": bk["proposed_times"][0]["id"]})
    assert client.post(f"{base}/no-show", headers=shop["owner"]).status_code == 409  # not yet
    past = datetime.now(timezone.utc) - timedelta(hours=3)
    with db_factory() as db:
        db.execute(update(Booking).where(Booking.id == bk["id"]).values(
            confirmed_start=past, confirmed_end=past + timedelta(minutes=45)))
        db.commit()
    assert client.post(f"{base}/no-show", headers=shop["owner"]).json()["status"] == "no_show"


def test_owner_cancel_needs_a_reason(client, shop, emails):
    cust, cust_email = _user(client)
    bk = _book(client, shop, cust).json()
    base = f"/api/v1/businesses/{shop['bid']}/bookings/{bk['id']}"
    client.post(f"{base}/accept", headers=shop["owner"], json={"proposed_time_id": bk["proposed_times"][0]["id"]})
    assert client.post(f"{base}/cancel", headers=shop["owner"], json={}).status_code == 422
    emails.clear()
    r = client.post(f"{base}/cancel", headers=shop["owner"], json={"reason": "Dentist is ill"})
    assert r.json()["cancelled_by"] == "owner" and "Dentist is ill" in emails[0]["body"]


def test_validation_and_access_rules(client, shop):
    cust, _ = _user(client)
    assert client.post("/api/v1/bookings", json={}).status_code == 401
    assert _book(client, shop, cust, consent_shared=False).status_code == 422
    assert _book(client, shop, cust, day=_next(-1)).status_code == 422  # in the past
    assert _book(client, shop, cust, at="03:00").status_code == 422  # closed hours
    four = {"business_id": shop["bid"], "service_id": shop["service_id"], "consent_shared": True,
            "proposals": [{"date": str(_next(3 + i)), "time": "10:00"} for i in range(4)]}
    assert client.post("/api/v1/bookings", headers=cust, json=four).status_code == 422
    assert _book(client, shop, shop["owner"]).status_code == 403  # own listing

    mine = _book(client, shop, cust).json()
    stranger, _ = _user(client)
    other_owner, _ = _user(client, "business_owner")
    assert client.get(f"/api/v1/bookings/{mine['id']}", headers=stranger).status_code == 404
    assert client.get(f"/api/v1/bookings/{mine['id']}", headers=cust).status_code == 200
    assert client.get(f"/api/v1/bookings/{mine['id']}", headers=shop["owner"]).status_code == 200
    assert client.get(f"/api/v1/businesses/{shop['bid']}/bookings", headers=other_owner).status_code == 403
    assert client.post(f"/api/v1/businesses/{shop['bid']}/bookings/{mine['id']}/decline",
                       headers=other_owner, json={"message": "no"}).status_code == 403
    assert client.post(f"/api/v1/bookings/{mine['id']}/cancel", headers=stranger, json={}).status_code == 404


def test_limit_of_waiting_requests_per_business(client, shop):
    cust, _ = _user(client)
    for i in range(3):
        assert _book(client, shop, cust, day=_next(3 + i)).status_code == 201
    assert _book(client, shop, cust, day=_next(9)).status_code == 429


def test_unlisted_business_and_inactive_service_are_refused(client, shop):
    cust, _ = _user(client)
    r = client.post("/api/v1/bookings", headers=cust, json={
        "business_id": shop["bid"], "service_id": 999999, "consent_shared": True,
        "proposals": [{"date": str(_next()), "time": "10:00"}]})
    assert r.status_code == 422
    other, _ = _user(client, "business_owner")
    assert client.get(f"/api/v1/businesses/{shop['bid']}/services", headers=other).status_code == 403


def test_last_service_cannot_be_removed_while_requests_are_on(client, shop):
    r = client.delete(f"/api/v1/businesses/{shop['bid']}/services/{shop['service_id']}", headers=shop["owner"])
    assert r.status_code == 422
    client.patch(f"/api/v1/businesses/{shop['bid']}", headers=shop["owner"], json={"booking_mode": "none"})
    assert client.delete(f"/api/v1/businesses/{shop['bid']}/services/{shop['service_id']}", headers=shop["owner"]).status_code == 204
    info = client.get(f"/api/v1/businesses/{shop['bid']}/booking-info")
    assert info.status_code == 404  # requests are off


def test_visit_window_flow(client, db_factory):
    owner, email = _user(client, "business_owner")
    bid = _listing(db_factory, email, category_slug="plumbers")
    svc = client.post(f"/api/v1/businesses/{bid}/services", headers=owner,
                      json={"name": "Drain clearing", "duration_minutes": 90}).json()
    client.patch(f"/api/v1/businesses/{bid}", headers=owner, json={"booking_mode": "request"})
    assert client.get(f"/api/v1/businesses/{bid}/booking-info").json()["style"] == "window"
    cust, _ = _user(client)
    r = client.post("/api/v1/bookings", headers=cust, json={
        "business_id": bid, "service_id": svc["id"], "consent_shared": True,
        "proposals": [{"date": str(_next()), "part": "morning"}, {"date": str(_next(4)), "part": "afternoon"}]})
    assert r.status_code == 201, r.text
    bk = r.json()
    assert [p["part_of_day"] for p in bk["proposed_times"]] == ["morning", "afternoon"]
    first = bk["proposed_times"][0]
    base = f"/api/v1/businesses/{bid}/bookings/{bk['id']}/accept"
    outside = client.post(base, headers=owner, json={"proposed_time_id": first["id"], "start": first["ends_at"]})
    assert outside.status_code == 422
    start = (datetime.fromisoformat(first["starts_at"]) + timedelta(hours=1)).isoformat()
    ok = client.post(base, headers=owner, json={"proposed_time_id": first["id"], "start": start})
    assert ok.status_code == 200, ok.text
    s, e = (datetime.fromisoformat(ok.json()[k]) for k in ("confirmed_start", "confirmed_end"))
    assert e - s == timedelta(minutes=90)


def test_admin_list_and_csv_neutralises_formulas(client, shop, db_factory):
    cust, _ = _user(client, name="=HYPERLINK(\"http://x\")")
    _book(client, shop, cust)
    admin, admin_email = _user(client)
    assert client.get("/api/v1/admin/bookings", headers=admin).status_code == 403
    with db_factory() as db:
        db.execute(update(User).where(User.email == admin_email).values(is_admin=True))
        db.commit()
    page = client.get("/api/v1/admin/bookings", headers=admin).json()
    assert page["total"] >= 1 and page["items"][0]["business_name"] == "Bright Smile"
    csv_text = client.get("/api/v1/admin/bookings.csv", headers=admin)
    assert csv_text.headers["content-type"].startswith("text/csv")
    assert "'=HYPERLINK" in csv_text.text and ",=HYPERLINK" not in csv_text.text
    assert client.get("/api/v1/admin/bookings.csv").status_code == 401
