"""Plan selection and payment through /subscriptions/checkout, for verified listings.

Covers the free plan (active at once, no gateway) and the test-mode card
payment that stands in for Stripe Checkout while no gateway is configured.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.category import Category
from app.models.subscription import BillingCycle, Plan
from app.models.verification import BusinessVerification, VerificationStatus
from app.services import payment_gateway


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture()
def plans(session_factory) -> dict[str, int]:
    """The free Basic plan comes from the migration; the paid ones are added here."""
    with session_factory() as db:
        basic = db.scalar(select(Plan).where(Plan.name == "Basic"))
        assert basic is not None, "the Basic plan migration did not run"
        ids = {"basic": basic.id}
        for key, name, cycle, amount in (
            ("monthly", "Test Standard", BillingCycle.monthly, "29.00"),
            ("yearly", "Test Standard (yearly)", BillingCycle.yearly, "290.00"),
        ):
            plan = db.scalar(select(Plan).where(Plan.name == name))
            if plan is None:
                plan = Plan(name=name, billing_cycle=cycle, amount=Decimal(amount))
                db.add(plan)
                db.flush()
            ids[key] = plan.id
        db.commit()
        return ids


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-registration"))
        if category is None:
            category = Category(name="Test Registration", slug="test-registration")
            db.add(category)
            db.commit()
        return category.id


_SESSION_FACTORY = None


@pytest.fixture(autouse=True)
def _remember_session_factory(session_factory):
    """Lets the helper below verify a listing straight in the database."""
    global _SESSION_FACTORY
    _SESSION_FACTORY = session_factory
    yield
    _SESSION_FACTORY = None


def _verify(business_id: int) -> None:
    """Payment follows verification, so these listings are verified up front."""
    with _SESSION_FACTORY() as db:
        db.add(
            BusinessVerification(
                business_id=business_id,
                email="kyc@example.ca",
                mobile_number="604 555 0100",
                status=VerificationStatus.verified,
            )
        )
        db.commit()


def _owner_with_listing(client: TestClient, email: str, category_id: int) -> tuple[dict, int]:
    r = client.post(
        "/api/v1/signup",
        json={
            "name": "Reg Owner",
            "email": email,
            "password": "password123",
            "phone": "+1-604-555-0100",
            "role": "business_owner",
        },
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post(
        "/api/v1/businesses",
        json={"name": "Registration Test Co", "category_id": category_id, "city": "Vancouver"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    _verify(r.json()["id"])
    return headers, r.json()["id"]


def _checkout(client, headers, business_id, plan_id):
    return client.post(
        "/api/v1/subscriptions/checkout",
        json={"business_id": business_id, "plan_id": plan_id},
        headers=headers,
    )


def _pay(client, headers, subscription_id, card="4242 4242 4242 4242", **overrides):
    body = {"card_number": card, "exp_month": 12, "exp_year": 2099 % 100, "cvc": "123"}
    body.update(overrides)
    return client.post(
        f"/api/v1/subscriptions/{subscription_id}/stub-payment", json=body, headers=headers
    )


def test_payment_config_reports_test_mode(client: TestClient) -> None:
    r = client.get("/api/v1/payments/config")

    assert r.status_code == 200
    assert r.json() == {"mode": "stub", "publishable_key": ""}


def test_free_plan_is_active_without_payment(client, unique_email, plans, category_id):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)

    r = _checkout(client, headers, business_id, plans["basic"])

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["requires_payment"] is False
    assert body["status"] == "active"
    assert body["session_id"] is None
    current = client.get(f"/api/v1/businesses/{business_id}/subscription", headers=headers)
    assert current.json()["status"] == "active"
    assert current.json()["plan"]["name"] == "Basic"


def test_paid_plan_starts_incomplete_and_test_card_activates_it(
    client, unique_email, plans, category_id
):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)

    started = _checkout(client, headers, business_id, plans["monthly"]).json()
    assert started["requires_payment"] is True
    assert started["status"] == "incomplete"
    assert started["stub"] is True

    r = _pay(client, headers, started["subscription_id"])

    assert r.status_code == 200, r.text
    paid = r.json()
    assert paid["status"] == "active"
    period_end = datetime.fromisoformat(paid["current_period_end"])
    days = (period_end - datetime.now(timezone.utc)).days
    assert 27 <= days <= 31


def test_yearly_plan_runs_for_a_year(client, unique_email, plans, category_id):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)
    started = _checkout(client, headers, business_id, plans["yearly"]).json()

    paid = _pay(client, headers, started["subscription_id"]).json()

    days = (datetime.fromisoformat(paid["current_period_end"]) - datetime.now(timezone.utc)).days
    assert 364 <= days <= 366


@pytest.mark.parametrize(
    ("card", "overrides", "message"),
    [
        ("4000 0000 0000 0002", {}, "declined"),
        ("4000 0000 0000 9995", {}, "insufficient funds"),
        ("4242 4242 4242 4241", {}, "number is incorrect"),
        ("4242 4242 4242 4242", {"exp_year": 20, "exp_month": 1}, "expiration date"),
        ("4242 4242 4242 4242", {"cvc": "12"}, "security code"),
        # A Luhn-valid number that is not a published test card: never accepted.
        ("4111 1111 1111 1111", {}, "test cards only"),
    ],
)
def test_declined_cards_leave_the_subscription_payable(
    client, unique_email, plans, category_id, card, overrides, message
):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)
    started = _checkout(client, headers, business_id, plans["monthly"]).json()

    r = _pay(client, headers, started["subscription_id"], card=card, **overrides)

    assert r.status_code == 402
    assert message in r.json()["detail"]
    current = client.get(f"/api/v1/businesses/{business_id}/subscription", headers=headers)
    assert current.json()["status"] == "incomplete"
    # And it can still be paid afterwards.
    assert _pay(client, headers, started["subscription_id"]).status_code == 200


def test_an_active_subscription_cannot_be_paid_again(client, unique_email, plans, category_id):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)
    started = _checkout(client, headers, business_id, plans["monthly"]).json()
    assert _pay(client, headers, started["subscription_id"]).status_code == 200

    assert _pay(client, headers, started["subscription_id"]).status_code == 409


def test_another_owner_cannot_pay_for_the_subscription(
    client, unique_email, plans, category_id
):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)
    started = _checkout(client, headers, business_id, plans["monthly"]).json()
    intruder, _ = _owner_with_listing(client, f"other-{unique_email}", category_id)

    assert _pay(client, intruder, started["subscription_id"]).status_code == 403


def test_switching_to_the_free_plan_cancels_the_unpaid_checkout(
    client, unique_email, plans, category_id
):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)
    abandoned = _checkout(client, headers, business_id, plans["monthly"]).json()

    assert _checkout(client, headers, business_id, plans["basic"]).status_code == 200

    r = _pay(client, headers, abandoned["subscription_id"])
    assert r.status_code == 409
    assert "canceled" in r.json()["detail"]


def test_test_payments_are_refused_once_a_real_gateway_is_configured(
    client, unique_email, plans, category_id, monkeypatch
):
    headers, business_id = _owner_with_listing(client, unique_email, category_id)
    started = _checkout(client, headers, business_id, plans["monthly"]).json()
    monkeypatch.setattr(payment_gateway, "gateway_configured", lambda: True)

    assert _pay(client, headers, started["subscription_id"]).status_code == 409
