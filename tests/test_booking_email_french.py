"""Booking emails name the service in English with its French name beside it."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.booking import Booking, BookingProposedTime
from app.models.business import Business
from app.services import booking_notify
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    _book,
    _user,
    db_factory,
    emails,
    shop,
)

START = datetime(2030, 3, 5, 18, 0, tzinfo=timezone.utc)


def _booking(name="Cleaning", name_fr="Nettoyage", **extra) -> Booking:
    booking = Booking(
        id=11,
        service_name=name,
        service_name_fr=name_fr,
        duration_minutes=45,
        customer_name="Casey",
        customer_email="casey@example.com",
        status="confirmed",
        confirmed_start=START,
        confirmed_end=START + timedelta(minutes=45),
        **extra,
    )
    booking.proposed_times = [
        BookingProposedTime(starts_at=START, ends_at=START + timedelta(minutes=45), part_of_day=None)
    ]
    return booking


def _business() -> Business:
    return Business(
        name="Bright Smile", address="1 Main St", city="Vancouver", province="BC", email="desk@example.com"
    )


@pytest.fixture()
def sent(monkeypatch):
    out: list[dict] = []
    monkeypatch.setattr(booking_notify, "send_email", lambda **kw: out.append(kw) or True)
    return out


def test_label_has_both_names_only_when_they_differ():
    assert booking_notify.service_label(_booking()) == "Cleaning (Nettoyage)"
    assert booking_notify.service_label(_booking(name_fr=None)) == "Cleaning"
    assert booking_notify.service_label(_booking(name_fr="   ")) == "Cleaning"
    assert booking_notify.service_label(_booking(name="Massage", name_fr="massage")) == "Massage"  # same word
    assert booking_notify.service_label(_booking(name_fr="Séance d'entraînement")) == "Cleaning (Séance d'entraînement)"


def test_every_email_carries_the_label(sent):
    booking, business = _booking(cancelled_by="customer"), _business()
    booking_notify.request_received(booking, business)
    booking_notify.confirmed(booking, business)
    booking_notify.declined(booking, business)
    booking_notify.cancelled(booking, business)  # by the customer: two emails
    booking.cancelled_by = "owner"
    booking_notify.cancelled(booking, business)
    assert len(sent) == 2 + 1 + 1 + 2 + 1
    for mail in sent:
        assert "Cleaning (Nettoyage)" in mail["subject"] + mail["body"], mail["subject"]


def test_subjects_stay_on_one_line_with_accents(sent):
    booking_notify.confirmed(_booking(name_fr="Nettoyage\nen profondeur"), _business())
    assert "\n" not in sent[0]["subject"] and "Nettoyage en profondeur" in sent[0]["subject"]


def test_calendar_file_summary_has_both_names():
    text = booking_notify.build_ics(_booking(), _business()).decode()
    assert "SUMMARY:Cleaning (Nettoyage) - Bright Smile" in text


def test_a_service_without_a_french_name_reads_as_before(sent):
    booking_notify.confirmed(_booking(name_fr=None), _business())
    assert "Cleaning" in sent[0]["subject"] and "(" not in sent[0]["subject"]


def test_end_to_end_the_confirmation_names_both(client, shop, emails):
    client.patch(
        f"/api/v1/businesses/{shop['bid']}/services/{shop['service_id']}",
        headers=shop["owner"],
        json={"name_fr": "Nettoyage"},
    )
    cust, _ = _user(client)
    booking = _book(client, shop, cust).json()
    assert "Cleaning (Nettoyage)" in emails[0]["subject"] + emails[0]["body"]  # the request email
    emails.clear()
    client.post(
        f"/api/v1/businesses/{shop['bid']}/bookings/{booking['id']}/accept",
        headers=shop["owner"],
        json={"proposed_time_id": booking["proposed_times"][0]["id"]},
    )
    (mail,) = emails
    assert "Cleaning (Nettoyage)" in mail["subject"]
    assert b"SUMMARY:Cleaning (Nettoyage)" in mail["attachments"][0][2]
