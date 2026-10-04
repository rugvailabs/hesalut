"""The admin's read-only view of bookings: the list, the CSV, what they leave out."""

from __future__ import annotations

import csv
import io

import pytest
from sqlalchemy import select, update

from app.models.audit_log import AuditLog
from app.models.user import User
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    _book,
    _next,
    _user,
    db_factory,
    emails,
    shop,
)

SECRET_NOTE = "I have chemotherapy that week, please be gentle"
SECRET_REASON = "my mother is in hospital"


@pytest.fixture()
def admin(client, db_factory):
    headers, email = _user(client)
    with db_factory() as db:
        db.execute(update(User).where(User.email == email).values(is_admin=True))
        db.commit()
    return headers


def _accept(client, shop, booking):
    return client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{booking['id']}/accept",
        headers=shop["owner"],
        json={"proposed_time_id": booking["proposed_times"][0]["id"]},
    )


def _audit(db_factory, action):
    with db_factory() as db:
        return db.scalars(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id)).all()


def _csv_rows(response):
    return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))


# ----------------------------------------------------------- who may look
def test_only_admins_may_look(client, shop, admin):
    customer, _ = _user(client)
    for path in ("/api/v1/admin/bookings", "/api/v1/admin/bookings.csv"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=customer).status_code == 403
        assert client.get(path, headers=shop["owner"]).status_code == 403  # an owner is not an admin
        assert client.get(path, headers=admin).status_code == 200


# -------------------------------------------------------------- the list
def test_list_shape_paging_and_usage(client, shop, admin):
    cust, _ = _user(client)
    for i in range(3):
        _book(client, shop, cust, day=_next(3 + i))
    page = client.get("/api/v1/admin/bookings", headers=admin, params={"page_size": 2}).json()
    assert len(page["items"]) == 2 and page["page"] == 1 and page["page_size"] == 2
    assert page["total"] >= 3 and page["total_pages"] == -(-page["total"] // 2)
    assert set(page["status_counts"]) == {
        "requested", "confirmed", "declined", "cancelled", "expired", "completed", "no_show"
    }
    assert page["status_counts"]["requested"] >= 3
    assert page["businesses_taking_requests"] >= 1 and page["requests_last_30_days"] >= 3
    second = client.get("/api/v1/admin/bookings", headers=admin, params={"page_size": 2, "page": 2}).json()
    assert second["items"][0]["id"] != page["items"][0]["id"]
    beyond = client.get("/api/v1/admin/bookings", headers=admin, params={"page": 999}).json()
    assert beyond["items"] == [] and beyond["total"] == page["total"]


def test_filters_and_status_counts(client, shop, admin):
    cust, _ = _user(client)
    keep = _book(client, shop, cust, day=_next(3)).json()
    _book(client, shop, cust, day=_next(4))
    assert _accept(client, shop, keep).status_code == 200
    only = client.get("/api/v1/admin/bookings", headers=admin, params={"status": "confirmed", "business_id": shop["bid"]}).json()
    assert [i["id"] for i in only["items"]] == [keep["id"]]
    # The chips show what each status would give, whichever one is chosen now.
    assert only["status_counts"]["confirmed"] == 1 and only["status_counts"]["requested"] == 1
    assert client.get("/api/v1/admin/bookings", headers=admin, params={"status": "bogus"}).status_code == 422
    found = client.get("/api/v1/admin/bookings", headers=admin, params={"q": "Casey", "business_id": shop["bid"]}).json()
    assert found["total"] == 2


# ------------------------------------------- what an admin is not shown
def test_the_list_never_carries_the_customers_note_or_their_typed_reason(client, shop, admin):
    cust, _ = _user(client)
    booking = _book(client, shop, cust, note=SECRET_NOTE).json()
    assert booking["note"] == SECRET_NOTE  # the owner and the customer do see it
    _accept(client, shop, booking)
    client.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=cust, json={"reason": SECRET_REASON})

    raw = client.get("/api/v1/admin/bookings", headers=admin, params={"business_id": shop["bid"]})
    assert SECRET_NOTE not in raw.text and SECRET_REASON not in raw.text
    item = raw.json()["items"][0]
    assert item["note"] is None and item["cancel_reason"] is None
    assert item["cancelled_by"] == "customer"  # who cancelled still shows; why they said so does not
    # ...while the owner of that business still reads the note.
    mine = client.get(f"/api/v1/businesses/{shop['bid']}/bookings", headers=shop["owner"]).json()[0]
    assert mine["note"] == SECRET_NOTE and mine["cancel_reason"] == SECRET_REASON


def test_a_business_given_reason_is_kept_because_a_complaint_may_hinge_on_it(client, shop, admin):
    cust, _ = _user(client)
    booking = _book(client, shop, cust).json()
    _accept(client, shop, booking)
    client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{booking['id']}/cancel",
        headers=shop["owner"], json={"reason": "Dentist is ill"},
    )
    item = client.get("/api/v1/admin/bookings", headers=admin, params={"business_id": shop["bid"]}).json()["items"][0]
    assert item["cancelled_by"] == "owner" and item["cancel_reason"] == "Dentist is ill"


def test_the_csv_leaves_out_the_note_and_the_customers_reason(client, shop, admin):
    cust, _ = _user(client)
    booking = _book(client, shop, cust, note=SECRET_NOTE).json()
    _accept(client, shop, booking)
    client.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=cust, json={"reason": SECRET_REASON})
    other = _book(client, shop, cust, day=_next(6)).json()
    _accept(client, shop, other)
    client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{other['id']}/cancel",
        headers=shop["owner"], json={"reason": "Power cut at the clinic"},
    )
    response = client.get("/api/v1/admin/bookings.csv", headers=admin, params={"business_id": shop["bid"]})
    assert SECRET_NOTE not in response.text and SECRET_REASON not in response.text
    rows = _csv_rows(response)
    assert "note" not in rows[0]
    assert "Power cut at the clinic" in response.text  # the business's own reason stays
    assert all(len(r) == len(rows[0]) for r in rows)


def test_the_csv_follows_the_filters_and_names_itself(client, shop, admin):
    cust, _ = _user(client)
    one = _book(client, shop, cust, day=_next(3)).json()
    _book(client, shop, cust, day=_next(4))
    _accept(client, shop, one)
    response = client.get(
        "/api/v1/admin/bookings.csv", headers=admin, params={"status": "confirmed", "business_id": shop["bid"]}
    )
    rows = _csv_rows(response)
    assert len(rows) == 2 and rows[1][rows[0].index("status")] == "confirmed"  # header + the one confirmed
    assert response.headers["content-disposition"].startswith('attachment; filename="bookings-')
    assert response.headers["content-type"].startswith("text/csv")
    assert response.content.startswith(b"\xef\xbb\xbf")
    assert client.get("/api/v1/admin/bookings.csv", headers=admin, params={"status": "bogus"}).status_code == 422


# ----------------------------------------------------------- the audit log
def test_reading_and_exporting_are_audit_logged_without_personal_details(client, shop, admin, db_factory):
    cust, email = _user(client, name="Distinctive Surname")
    _book(client, shop, cust)
    before_list = len(_audit(db_factory, "admin.bookings.list"))
    before_export = len(_audit(db_factory, "admin.bookings.export"))
    client.get("/api/v1/admin/bookings", headers=admin, params={"q": "Distinctive", "business_id": shop["bid"]})
    client.get("/api/v1/admin/bookings.csv", headers=admin, params={"q": "Distinctive", "business_id": shop["bid"]})

    listed = _audit(db_factory, "admin.bookings.list")
    exported = _audit(db_factory, "admin.bookings.export")
    assert len(listed) == before_list + 1 and len(exported) == before_export + 1
    entry = listed[-1]
    assert entry.actor.startswith("user:") and entry.target_table == "bookings" and entry.target_id == 0
    assert entry.meta["business_id"] == shop["bid"] and entry.meta["returned"] >= 1
    assert exported[-1].meta["rows"] >= 1 and exported[-1].meta["truncated"] is False
    # The log says a search was used, never what it was.
    for logged in (entry, exported[-1]):
        assert logged.meta["q"] is True
        assert "Distinctive" not in str(logged.meta) and email not in str(logged.meta)


def test_a_refused_request_leaves_no_audit_entry(client, shop, db_factory):
    before = len(_audit(db_factory, "admin.bookings.list"))
    customer, _ = _user(client)
    client.get("/api/v1/admin/bookings", headers=customer)
    client.get("/api/v1/admin/bookings")
    assert len(_audit(db_factory, "admin.bookings.list")) == before
