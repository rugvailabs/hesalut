"""Services carry an optional French name, copied onto bookings."""

from __future__ import annotations

from sqlalchemy import select

from app.models.booking import BookableService
from scripts.seed_booking import FRENCH_NAMES, SERVICES_BY_CATEGORY, seed_booking
from tests.test_booking_requests import (  # noqa: F401  - fixtures used by name
    _book,
    _user,
    db_factory,
    emails,
    shop,
)
from tests.test_seed_booking import _demo_listing, db  # noqa: F401


def _services_url(shop):
    return f"/api/v1/businesses/{shop['bid']}/services"


def test_create_with_a_french_name_and_read_it_back(client, shop):
    r = client.post(
        _services_url(shop),
        headers=shop["owner"],
        json={"name": "Whitening", "name_fr": "  Blanchiment  des dents ", "duration_minutes": 45},
    )
    assert r.status_code == 201, r.text
    assert r.json()["name_fr"] == "Blanchiment des dents"  # whitespace tidied
    listed = client.get(_services_url(shop), headers=shop["owner"]).json()
    assert {s["name"]: s["name_fr"] for s in listed}["Whitening"] == "Blanchiment des dents"


def test_french_name_is_optional_and_blank_means_none(client, shop):
    plain = client.post(_services_url(shop), headers=shop["owner"], json={"name": "A", "duration_minutes": 30}).json()
    blank = client.post(
        _services_url(shop), headers=shop["owner"], json={"name": "B", "name_fr": "   ", "duration_minutes": 30}
    ).json()
    assert plain["name_fr"] is None and blank["name_fr"] is None


def test_update_sets_and_clears_the_french_name(client, shop):
    url = f"{_services_url(shop)}/{shop['service_id']}"
    r = client.patch(url, headers=shop["owner"], json={"name_fr": "Nettoyage"})
    assert r.json()["name_fr"] == "Nettoyage" and r.json()["name"] == "Cleaning"
    # Not mentioning it leaves it alone ...
    assert client.patch(url, headers=shop["owner"], json={"duration_minutes": 50}).json()["name_fr"] == "Nettoyage"
    # ... and an explicit null removes it.
    assert client.patch(url, headers=shop["owner"], json={"name_fr": None}).json()["name_fr"] is None


def test_public_booking_info_exposes_the_french_name(client, shop):
    client.patch(
        f"{_services_url(shop)}/{shop['service_id']}", headers=shop["owner"], json={"name_fr": "Nettoyage"}
    )
    info = client.get(f"/api/v1/businesses/{shop['bid']}/booking-info").json()
    assert info["services"][0]["name"] == "Cleaning" and info["services"][0]["name_fr"] == "Nettoyage"


def test_booking_keeps_the_french_name_it_was_made_with(client, shop):
    url = f"{_services_url(shop)}/{shop['service_id']}"
    client.patch(url, headers=shop["owner"], json={"name_fr": "Nettoyage"})
    cust, _ = _user(client)
    booking = _book(client, shop, cust).json()
    assert booking["service_name"] == "Cleaning" and booking["service_name_fr"] == "Nettoyage"
    # Renaming the service later does not rewrite the booking.
    client.patch(url, headers=shop["owner"], json={"name": "Deep cleaning", "name_fr": "Nettoyage en profondeur"})
    mine = client.get("/api/v1/bookings/mine", headers=cust).json()[0]
    assert mine["service_name"] == "Cleaning" and mine["service_name_fr"] == "Nettoyage"


def test_every_seeded_service_has_a_french_name():
    english = {name for items in SERVICES_BY_CATEGORY.values() for name, _m, _p in items}
    assert english <= set(FRENCH_NAMES), english - set(FRENCH_NAMES)
    assert all(FRENCH_NAMES[name].strip() for name in english)


def test_seed_backfills_french_names_but_keeps_an_owners_own(db):
    business = _demo_listing(db, "dentists", booking_mode="none")
    db.add_all(
        [
            BookableService(business_id=business.id, name="Check-up and cleaning", duration_minutes=60),
            BookableService(
                business_id=business.id, name="Emergency exam", name_fr="Mon propre nom", duration_minutes=30
            ),
            BookableService(business_id=business.id, name="Something custom", duration_minutes=30),
        ]
    )
    db.flush()
    seed_booking(db)
    by_name = {
        s.name: s.name_fr
        for s in db.scalars(select(BookableService).where(BookableService.business_id == business.id))
    }
    assert by_name["Check-up and cleaning"] == FRENCH_NAMES["Check-up and cleaning"]
    assert by_name["Emergency exam"] == "Mon propre nom"
    assert by_name["Something custom"] is None
