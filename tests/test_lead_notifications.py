"""New-lead notifications for business owners: the dashboard counts and the email."""

from __future__ import annotations

import time
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.api.v1 import enquiries as enquiries_module
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.verification import BusinessVerification, VerificationStatus


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    def fake_send(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(enquiries_module, "send_email", fake_send)
    return sent


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-lead-notices"))
        if category is None:
            category = Category(name="Test Lead Notices", slug="test-lead-notices")
            db.add(category)
            db.commit()
        return category.id


@pytest.fixture()
def owner(client, category_id, session_factory) -> dict:
    """An owner with one publicly visible listing: headers, business id, email."""
    email = f"leads-{uuid.uuid4().hex[:10]}@example.ca"
    token = client.post(
        "/api/v1/signup",
        json={
            "name": "Lead Owner",
            "email": email,
            "password": "password123",
            "phone": "+1-604-555-0100",
            "role": "business_owner",
        },
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post(
        "/api/v1/businesses",
        json={"name": "Lead Plumbing", "category_id": category_id, "city": "Vancouver"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    business_id = r.json()["id"]
    with session_factory() as db:
        db.get(Business, business_id).status = BusinessStatus.approved
        db.add(
            BusinessVerification(
                business_id=business_id,
                email="kyc@example.ca",
                mobile_number="604 555 0100",
                status=VerificationStatus.verified,
            )
        )
        db.commit()
    return {"headers": headers, "business_id": business_id, "email": email}


def _lead(client, business_id, kind="quote", **extra):
    body = {
        "enquiry_type": kind,
        "message": "Can you fix a leaking tap?",
        "contact_name": "Cara Customer",
        "contact_phone": "604 555 0123",
        "contact_email": "cara@example.ca",
        **extra,
    }
    r = client.post(f"/api/v1/businesses/{business_id}/enquiries", json=body)
    assert r.status_code == 201, r.text
    # Leads are stamped by the database clock; keep the next one strictly later.
    time.sleep(0.01)
    return r


def _notes(client, owner) -> dict:
    return client.get("/api/v1/notifications/leads", headers=owner["headers"]).json()


def _mark_seen(client, owner):
    return client.post(
        f"/api/v1/notifications/leads/{owner['business_id']}/seen", headers=owner["headers"]
    )


# ------------------------------------------------------------------- counts


def test_a_new_listing_has_nothing_new(client, owner):
    notes = _notes(client, owner)

    assert notes["total_new"] == 0
    assert [(b["business_id"], b["new_leads"]) for b in notes["businesses"]] == [
        (owner["business_id"], 0)
    ]


def test_each_lead_counts_as_new_until_the_owner_looks(client, owner):
    _lead(client, owner["business_id"], "quote")
    _lead(client, owner["business_id"], "callback")
    _lead(client, owner["business_id"], "call_click", message=None)

    notes = _notes(client, owner)

    assert notes["total_new"] == 3
    assert notes["businesses"][0]["new_leads"] == 3


def test_marking_seen_clears_the_count_and_a_later_lead_is_new_again(client, owner):
    _lead(client, owner["business_id"])
    _lead(client, owner["business_id"])

    cleared = _mark_seen(client, owner)

    assert cleared.status_code == 200
    assert cleared.json()["total_new"] == 0
    _lead(client, owner["business_id"], "callback")
    assert _notes(client, owner)["total_new"] == 1


def test_the_seen_marker_is_returned_so_the_page_can_tag_new_leads(client, owner):
    _lead(client, owner["business_id"])
    before = _notes(client, owner)["businesses"][0]["leads_seen_at"]

    _mark_seen(client, owner)
    after = _notes(client, owner)["businesses"][0]["leads_seen_at"]

    assert after > before


# -------------------------------------------------------------------- email


def test_a_message_lead_emails_the_owner_with_the_details(client, owner, sent_emails):
    _lead(client, owner["business_id"], "quote")

    assert len(sent_emails) == 1
    mail = sent_emails[0]
    assert mail["to"] == owner["email"]
    assert "New lead for Lead Plumbing" in mail["subject"]
    assert "a quote" in mail["subject"]
    assert "Can you fix a leaking tap?" in mail["body"]
    assert "604 555 0123" in mail["body"] and "cara@example.ca" in mail["body"]
    assert f"/dashboard/{owner['business_id']}/leads" in mail["body"]
    # Replying goes to the customer.
    assert mail["reply_to"] == "cara@example.ca"


@pytest.mark.parametrize("kind", ["callback", "chat"])
def test_other_message_leads_are_emailed_too(client, owner, sent_emails, kind):
    _lead(client, owner["business_id"], kind)

    assert len(sent_emails) == 1


def test_a_call_click_is_counted_but_not_emailed(client, owner, sent_emails):
    _lead(client, owner["business_id"], "call_click", message=None)

    assert sent_emails == []
    assert _notes(client, owner)["total_new"] == 1


# ------------------------------------------------------------------- access


def test_notifications_need_an_owner_account(client, unique_email):
    assert client.get("/api/v1/notifications/leads").status_code == 401
    token = client.post(
        "/api/v1/signup", json={"name": "C", "email": unique_email, "password": "password123"}
    ).json()["access_token"]

    r = client.get("/api/v1/notifications/leads", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_an_owner_sees_only_their_own_listings(client, owner, category_id):
    _lead(client, owner["business_id"])
    other_token = client.post(
        "/api/v1/signup",
        json={
            "name": "Other Owner",
            "email": f"other-{uuid.uuid4().hex[:8]}@example.ca",
            "password": "password123",
            "role": "business_owner",
        },
    ).json()["access_token"]

    other = client.get(
        "/api/v1/notifications/leads", headers={"Authorization": f"Bearer {other_token}"}
    ).json()

    assert other["total_new"] == 0 and other["businesses"] == []


def test_another_owner_cannot_mark_a_listing_seen(client, owner):
    other_token = client.post(
        "/api/v1/signup",
        json={
            "name": "Other Owner",
            "email": f"other-{uuid.uuid4().hex[:8]}@example.ca",
            "password": "password123",
            "role": "business_owner",
        },
    ).json()["access_token"]
    _lead(client, owner["business_id"])

    r = client.post(
        f"/api/v1/notifications/leads/{owner['business_id']}/seen",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert r.status_code == 403
    assert _notes(client, owner)["total_new"] == 1
