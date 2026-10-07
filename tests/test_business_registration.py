"""The three-step business registration: details, confirm, done. No plan, no payment."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.api.v1 import registration as registration_module
from app.models.business import Business
from app.models.category import Category
from app.models.subscription import Subscription
from app.models.user import User
from app.services import sales_tax

@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    def fake_send(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(registration_module, "send_email", fake_send)
    return sent


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-registration"))
        if category is None:
            category = Category(name="Test Registration", slug="test-registration")
            db.add(category)
            db.commit()
        return category.id


def _start(client: TestClient, category_id: int, email: str | None = None, **overrides):
    body = {
        "name": "Reg Owner",
        "email": email or f"reg-{uuid.uuid4().hex[:10]}@example.ca",
        "phone": "+1 604 555 0100",
        "password": "password123",
        "business_name": "Registration Plumbing",
        "category_id": category_id,
        "address": "1 Water St",
        "city": "Toronto",
        "province": "ON",
        "postal_code": "M5V 1A1",
    }
    body.update(overrides)
    return client.post("/api/v1/registration/start", json=body)


def _auth(response) -> dict:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _complete(client, headers, accept=True):
    return client.post(
        "/api/v1/registration/complete", json={"accept_terms": accept}, headers=headers
    )


# ------------------------------------------------------------------ step 1


def test_start_creates_an_inactive_account_and_no_listing(client, category_id, session_factory):
    r = _start(client, category_id)

    assert r.status_code == 201, r.text
    state = r.json()["state"]
    assert state["step"] == 2
    assert state["completed"] is False
    assert state["details"]["business_name"] == "Registration Plumbing"
    assert state["business"] is None
    headers = _auth(r)
    assert client.get("/api/v1/me", headers=headers).json()["is_active"] is False
    # The dashboard is locked until registration completes.
    assert client.get("/api/v1/businesses/owner/mine", headers=headers).status_code == 403
    user_id = client.get("/api/v1/me", headers=headers).json()["id"]
    with session_factory() as db:
        assert db.scalar(select(Business).where(Business.owner_id == user_id)) is None


def test_duplicate_email_is_refused_regardless_of_case(client, category_id):
    email = f"dup-{uuid.uuid4().hex[:8]}@example.ca"
    assert _start(client, category_id, email=email).status_code == 201

    r = _start(client, category_id, email=email.upper())

    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


def test_unknown_province_is_rejected(client, category_id):
    assert _start(client, category_id, province="ZZ").status_code == 422


def test_details_can_be_edited_after_going_back(client, category_id):
    headers = _auth(_start(client, category_id))

    r = client.put(
        "/api/v1/registration/details",
        json={
            "name": "Renamed Owner",
            "phone": "604 555 0199",
            "business_name": "Renamed Plumbing",
            "category_id": category_id,
            "city": "Halifax",
            "province": "NS",
        },
        headers=headers,
    )

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["details"]["business_name"] == "Renamed Plumbing"
    assert state["details"]["province"] == "NS"
    assert state["account"]["name"] == "Renamed Owner"


# ------------------------------------------------------------ steps 2 and 3


def test_registration_has_no_plan_or_payment_step(client, category_id):
    headers = _auth(_start(client, category_id))

    plan = client.put("/api/v1/registration/plan", json={"plan_id": 1}, headers=headers)
    pay = client.post("/api/v1/registration/payment", json={}, headers=headers)

    assert plan.status_code in (404, 405)
    assert pay.status_code in (404, 405)


def test_completing_creates_a_pending_listing_and_charges_nothing(
    client, category_id, session_factory, sent_emails
):
    start = _start(client, category_id)
    headers = _auth(start)
    email = start.json()["state"]["account"]["email"]

    r = _complete(client, headers)

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["step"] == 3 and state["completed"] is True
    # A listing, pending review, owned by the account - and nothing else.
    assert state["business"]["name"] == "Registration Plumbing"
    assert state["business"]["status"] == "pending"
    assert "subscription" not in state and "receipt" not in state
    with session_factory() as db:
        owned = db.scalar(select(Subscription).where(Subscription.business_id == state["business"]["id"]))
        assert owned is None
    # The account is active: the dashboard opens, so verification can start.
    assert client.get("/api/v1/me", headers=headers).json()["is_active"] is True
    assert client.get("/api/v1/businesses/owner/mine", headers=headers).status_code == 200
    # One welcome email, which says payment comes after verification.
    assert [m["to"] for m in sent_emails] == [email]
    assert sent_emails[0]["subject"].startswith("Welcome")
    assert "pay only after your business is verified" in sent_emails[0]["body"]


def test_terms_must_be_accepted(client, category_id):
    headers = _auth(_start(client, category_id))

    assert _complete(client, headers, accept=False).status_code == 422
    assert client.get("/api/v1/registration", headers=headers).json()["completed"] is False


def test_a_completed_registration_cannot_be_completed_or_edited_again(client, category_id):
    headers = _auth(_start(client, category_id))
    assert _complete(client, headers).status_code == 200

    assert _complete(client, headers).status_code == 409
    again = client.put(
        "/api/v1/registration/details",
        json={
            "name": "X",
            "phone": "604 555 0100",
            "business_name": "X",
            "category_id": category_id,
            "city": "Y",
            "province": "ON",
        },
        headers=headers,
    )
    assert again.status_code == 409


def test_an_account_saved_at_the_old_payment_step_resumes_at_the_terms(
    client, category_id, session_factory
):
    headers = _auth(_start(client, category_id))
    user_id = client.get("/api/v1/me", headers=headers).json()["id"]
    with session_factory() as db:
        db.query(User).filter(User.id == user_id).update({"registration_step": 3})
        db.commit()

    state = client.get("/api/v1/registration", headers=headers).json()

    assert state["step"] == 2 and state["completed"] is False


# ------------------------------------------------------------------ access


def test_customers_cannot_use_registration(client, unique_email):
    token = client.post(
        "/api/v1/signup",
        json={"name": "C", "email": unique_email, "password": "password123"},
    ).json()["access_token"]

    r = client.get("/api/v1/registration", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_owners_from_before_registration_count_as_registered(client, unique_email):
    token = client.post(
        "/api/v1/signup",
        json={"name": "O", "email": unique_email, "password": "password123", "role": "business_owner"},
    ).json()["access_token"]

    state = client.get("/api/v1/registration", headers={"Authorization": f"Bearer {token}"}).json()

    assert state["completed"] is True and state["step"] == 3


# --------------------------------------------------------------- sales tax


@pytest.mark.parametrize(
    ("province", "expected"),
    [
        ("ON", [("HST", "3.77")]),
        ("NS", [("HST", "4.06")]),
        ("NB", [("HST", "4.35")]),
        ("AB", [("GST", "1.45")]),
        ("QC", [("GST", "1.45")]),  # QST listed, not collected
    ],
)
def test_sales_tax_by_province(province, expected):
    taxed = sales_tax.calculate(Decimal("29.00"), province)

    assert [(line.name, str(line.amount)) for line in taxed.lines] == expected
    assert taxed.total == taxed.subtotal + sum(line.amount for line in taxed.lines)


def test_free_plans_carry_no_tax():
    assert sales_tax.calculate(Decimal("0"), "ON").lines == []


def test_unknown_province_raises():
    with pytest.raises(sales_tax.UnknownProvince):
        sales_tax.calculate(Decimal("29.00"), "XX")


# ------------------------------------------------- customers who become owners


def _customer(client, email):
    token = client.post(
        "/api/v1/signup", json={"name": "Cara", "email": email, "password": "password123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


CONVERT = {
    "name": "Cara Customer",
    "phone": "604 555 0123",
    "business_name": "Cara's Cleaning",
    "city": "Vancouver",
    "province": "BC",
}


def test_a_signed_in_customer_can_register_their_business_on_the_same_account(
    client, unique_email, category_id
):
    headers = _customer(client, unique_email)

    r = client.post("/api/v1/registration/convert", json={**CONVERT, "category_id": category_id}, headers=headers)

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["step"] == 2 and state["completed"] is False
    assert state["account"]["email"] == unique_email
    me = client.get("/api/v1/me", headers=headers).json()
    assert (me["role"], me["is_active"]) == ("business_owner", False)
    # The rest of registration works on the same token.
    done = client.post("/api/v1/registration/complete", json={"accept_terms": True}, headers=headers)
    assert done.json()["business"]["name"] == "Cara's Cleaning"
    assert client.get("/api/v1/businesses/owner/mine", headers=headers).status_code == 200


def test_convert_is_only_for_customers(client, unique_email, category_id, session_factory):
    body = {**CONVERT, "category_id": category_id}
    owner = _auth(_start(client, category_id))
    admin = _customer(client, f"admin-{unique_email}")
    with session_factory() as db:
        db.query(User).filter(User.email == f"admin-{unique_email}").update({"is_admin": True})
        db.commit()

    assert client.post("/api/v1/registration/convert", json=body, headers=owner).status_code == 409
    assert client.post("/api/v1/registration/convert", json=body, headers=admin).status_code == 403
    assert client.post("/api/v1/registration/convert", json=body).status_code == 401
