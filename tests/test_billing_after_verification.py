"""Payment follows verification: register, submit documents, get approved, then pay."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.api.v1 import billing as billing_module
from app.api.v1 import registration as registration_module
from app.api.v1 import verification as verification_module
from app.models.category import Category
from app.models.subscription import Plan, Subscription
from app.models.user import User

GOOD_CARD = {"card_number": "4242 4242 4242 4242", "exp_month": 12, "exp_year": 99, "cvc": "123"}
KYC = {"email": "kyc@example.ca", "mobile_number": "604 555 0100"}


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    def fake_send(**kwargs):
        sent.append(kwargs)
        return True

    for module in (registration_module, billing_module, verification_module):
        monkeypatch.setattr(module, "send_email", fake_send)
    return sent


@pytest.fixture()
def plan_ids(session_factory) -> dict[str, int]:
    """Annual, Monthly and Basic come from the migrations."""
    with session_factory() as db:
        rows = db.scalars(select(Plan).where(Plan.name.in_(["Annual", "Monthly", "Basic"]))).all()
        ids = {plan.name: plan.id for plan in rows}
    assert set(ids) == {"Annual", "Monthly", "Basic"}, "plan migration did not run"
    return ids


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-billing"))
        if category is None:
            category = Category(name="Test Billing", slug="test-billing")
            db.add(category)
            db.commit()
        return category.id


@pytest.fixture()
def admin_headers(client, session_factory) -> dict:
    email = f"billing-admin-{uuid.uuid4().hex[:8]}@example.ca"
    token = client.post(
        "/api/v1/signup", json={"name": "Admin", "email": email, "password": "password123"}
    ).json()["access_token"]
    with session_factory() as db:
        db.query(User).filter(User.email == email).update({"is_admin": True})
        db.commit()
    return {"Authorization": f"Bearer {token}"}


def _registered_owner(client: TestClient, category_id: int, province: str = "ON") -> tuple[dict, int, str]:
    """A fully registered owner: (auth headers, business id, email)."""
    email = f"bill-{uuid.uuid4().hex[:10]}@example.ca"
    start = client.post(
        "/api/v1/registration/start",
        json={
            "name": "Bill Owner",
            "email": email,
            "phone": "+1 604 555 0100",
            "password": "password123",
            "business_name": "Billing Plumbing",
            "category_id": category_id,
            "city": "Toronto",
            "province": province,
        },
    )
    assert start.status_code == 201, start.text
    headers = {"Authorization": f"Bearer {start.json()['access_token']}"}
    done = client.post("/api/v1/registration/complete", json={"accept_terms": True}, headers=headers)
    assert done.status_code == 200, done.text
    return headers, done.json()["business"]["id"], email


def _submit_kyc(client, headers, business_id) -> int:
    r = client.post(f"/api/v1/businesses/{business_id}/verification", json=KYC, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _approve(client, admin_headers, verification_id):
    return client.post(f"/api/v1/admin/verifications/{verification_id}/approve", headers=admin_headers)


def _verified_owner(client, category_id, admin_headers, province="ON"):
    headers, business_id, email = _registered_owner(client, category_id, province)
    verification_id = _submit_kyc(client, headers, business_id)
    assert _approve(client, admin_headers, verification_id).status_code == 200
    return headers, business_id, email


def _subscribe(client, headers, business_id, plan_id, **overrides):
    body = {"plan_id": plan_id, "accept_terms": True, **GOOD_CARD, **overrides}
    return client.post(f"/api/v1/businesses/{business_id}/billing/subscribe", json=body, headers=headers)


# ------------------------------------------------------ blocked until verified


def test_billing_is_closed_before_any_documents_are_submitted(client, category_id, plan_ids):
    headers, business_id, _ = _registered_owner(client, category_id)

    state = client.get(f"/api/v1/businesses/{business_id}/billing", headers=headers).json()

    assert state["verification_status"] is None
    assert state["can_subscribe"] is False
    assert "Verify your business first" in state["blocked_reason"]
    assert state["subscription"] is None


def test_a_plan_cannot_be_bought_before_verification(client, category_id, plan_ids, session_factory):
    headers, business_id, _ = _registered_owner(client, category_id)

    order = client.get(
        f"/api/v1/businesses/{business_id}/billing/order?plan_id={plan_ids['Monthly']}", headers=headers
    )
    paid = _subscribe(client, headers, business_id, plan_ids["Monthly"])
    free = _subscribe(client, headers, business_id, plan_ids["Basic"])

    assert order.status_code == paid.status_code == free.status_code == 409
    with session_factory() as db:
        assert db.scalar(select(Subscription).where(Subscription.business_id == business_id)) is None


def test_the_older_checkout_route_follows_the_same_rule(client, category_id, plan_ids):
    headers, business_id, _ = _registered_owner(client, category_id)

    r = client.post(
        "/api/v1/subscriptions/checkout",
        json={"business_id": business_id, "plan_id": plan_ids["Monthly"]},
        headers=headers,
    )

    assert r.status_code == 409
    assert "Verify your business" in r.json()["detail"]


def test_a_plan_cannot_be_bought_while_the_documents_are_under_review(client, category_id, plan_ids):
    headers, business_id, _ = _registered_owner(client, category_id)
    _submit_kyc(client, headers, business_id)

    state = client.get(f"/api/v1/businesses/{business_id}/billing", headers=headers).json()
    r = _subscribe(client, headers, business_id, plan_ids["Monthly"])

    assert state["verification_status"] == "pending" and state["can_subscribe"] is False
    assert "being reviewed" in state["blocked_reason"]
    assert r.status_code == 409


def test_a_rejected_business_cannot_buy_a_plan(client, category_id, plan_ids, admin_headers):
    headers, business_id, _ = _registered_owner(client, category_id)
    verification_id = _submit_kyc(client, headers, business_id)
    client.post(
        f"/api/v1/admin/verifications/{verification_id}/reject",
        json={"reason": "The licence number is unreadable."},
        headers=admin_headers,
    )

    state = client.get(f"/api/v1/businesses/{business_id}/billing", headers=headers).json()

    assert state["verification_status"] == "rejected" and state["can_subscribe"] is False
    assert "not approved" in state["blocked_reason"]
    assert _subscribe(client, headers, business_id, plan_ids["Monthly"]).status_code == 409


# -------------------------------------------------------- open once verified


def test_approval_emails_the_owner_a_link_to_choose_a_plan(
    client, category_id, admin_headers, sent_emails
):
    headers, business_id, email = _registered_owner(client, category_id)
    verification_id = _submit_kyc(client, headers, business_id)
    sent_emails.clear()

    assert _approve(client, admin_headers, verification_id).status_code == 200

    assert [m["to"] for m in sent_emails] == [email]
    assert "is verified" in sent_emails[0]["subject"]
    assert f"/dashboard/{business_id}/billing" in sent_emails[0]["body"]
    state = client.get(f"/api/v1/businesses/{business_id}/billing", headers=headers).json()
    assert state["can_subscribe"] is True and state["blocked_reason"] is None


def test_the_order_is_priced_for_the_business_province(client, category_id, plan_ids, admin_headers):
    headers, business_id, _ = _verified_owner(client, category_id, admin_headers, province="ON")

    order = client.get(
        f"/api/v1/businesses/{business_id}/billing/order?plan_id={plan_ids['Monthly']}", headers=headers
    ).json()

    assert order["subtotal"] == "29.00"
    assert order["tax_lines"] == [{"name": "HST", "rate": "13", "amount": "3.77"}]
    assert order["total"] == "32.77"
    assert order["requires_payment"] is True and order["period_label"] == "1 month"


def test_paying_activates_the_plan_and_sends_a_receipt(
    client, category_id, plan_ids, admin_headers, sent_emails
):
    headers, business_id, email = _verified_owner(client, category_id, admin_headers)
    sent_emails.clear()

    r = _subscribe(client, headers, business_id, plan_ids["Monthly"])

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["subscription"]["status"] == "active"
    assert state["subscription"]["plan"]["name"] == "Monthly"
    assert state["subscription"]["current_period_end"] is not None
    receipt = state["receipt"]
    assert receipt["receipt_number"].startswith("JFY-")
    assert receipt["total"] == "32.77"
    assert receipt["tax_lines"] == [{"name": "HST", "rate": "13", "amount": "3.77"}]
    assert receipt["card_last4"] == "4242"
    assert state["can_subscribe"] is False
    assert [m["to"] for m in sent_emails] == [email]
    assert "Receipt JFY-" in sent_emails[0]["subject"]
    assert "$32.77 CAD" in sent_emails[0]["body"] and "renews automatically" in sent_emails[0]["body"]


def test_a_declined_card_creates_nothing_and_can_be_retried(
    client, category_id, plan_ids, admin_headers, session_factory
):
    headers, business_id, _ = _verified_owner(client, category_id, admin_headers)

    declined = _subscribe(client, headers, business_id, plan_ids["Monthly"], card_number="4000 0000 0000 0002")

    assert declined.status_code == 402
    assert declined.json()["detail"] == "Your card was declined."
    with session_factory() as db:
        assert db.scalar(select(Subscription).where(Subscription.business_id == business_id)) is None
    assert _subscribe(client, headers, business_id, plan_ids["Monthly"]).status_code == 200


def test_the_free_plan_needs_no_card(client, category_id, plan_ids, admin_headers):
    headers, business_id, _ = _verified_owner(client, category_id, admin_headers)

    r = client.post(
        f"/api/v1/businesses/{business_id}/billing/subscribe",
        json={"plan_id": plan_ids["Basic"], "accept_terms": True},
        headers=headers,
    )

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["subscription"]["plan"]["name"] == "Basic"
    assert state["subscription"]["current_period_end"] is None
    assert state["receipt"] is None


def test_a_paid_plan_needs_card_details_and_the_terms(client, category_id, plan_ids, admin_headers):
    headers, business_id, _ = _verified_owner(client, category_id, admin_headers)

    no_card = client.post(
        f"/api/v1/businesses/{business_id}/billing/subscribe",
        json={"plan_id": plan_ids["Monthly"], "accept_terms": True},
        headers=headers,
    )
    no_terms = _subscribe(client, headers, business_id, plan_ids["Monthly"], accept_terms=False)

    assert no_card.status_code == 422
    assert no_terms.status_code == 422


def test_a_listing_cannot_subscribe_twice(client, category_id, plan_ids, admin_headers):
    headers, business_id, _ = _verified_owner(client, category_id, admin_headers)
    assert _subscribe(client, headers, business_id, plan_ids["Monthly"]).status_code == 200

    again = _subscribe(client, headers, business_id, plan_ids["Annual"])

    assert again.status_code == 409
    assert "already has a plan" in again.json()["detail"]


def test_another_owner_cannot_see_or_pay_for_the_listing(client, category_id, plan_ids, admin_headers):
    _, business_id, _ = _verified_owner(client, category_id, admin_headers)
    other, _, _ = _registered_owner(client, category_id)

    assert client.get(f"/api/v1/businesses/{business_id}/billing", headers=other).status_code == 403
    assert _subscribe(client, other, business_id, plan_ids["Monthly"]).status_code == 403
    assert client.get(f"/api/v1/businesses/{business_id}/billing").status_code == 401
