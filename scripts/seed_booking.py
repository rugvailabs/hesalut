"""Seed data for booking requests: services, and booking switched on.

Run from the project root (or inside the backend container):

    python -m scripts.seed_booking

Also called by `python -m scripts.seed`. Idempotent and conservative:

- only the demo listings in scripts/seed_directory.py (and the demo owner's
  listing) are touched, never a business an owner created;
- a listing that already has any service is left exactly as it is, so edits
  made in the dashboard survive a re-run;
- booking requests are switched on only where booking is currently off - a
  listing that points at its own external booking page keeps that;
- opening hours already come from seed_directory.HOURS_BY_CATEGORY, which is
  what the booking form checks suggested times against.

Service names, lengths and prices are invented and shaped like local listings.
Prices are in cents; None means "price on request".
"""

from __future__ import annotations

import sys
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.booking import BookableService
from app.models.business import Business
from app.models.category import Category
from app.services import booking_rules
from scripts.seed_directory import BUSINESSES, SEED_OWNED_SLUG

DEFAULT_POLICY = (
    "Please give at least 24 hours notice to change or cancel. "
    "There is no fee for cancelling."
)

# (name, minutes, price in cents or None)
SERVICES_BY_CATEGORY: Dict[str, List[Tuple[str, int, Optional[int]]]] = {
    "dentists": [
        ("Check-up and cleaning", 60, 14500),
        ("Emergency exam", 30, 9500),
        ("Whitening consultation", 45, None),
    ],
    "salons": [
        ("Women's cut and style", 60, 8500),
        ("Men's cut", 30, 4500),
        ("Colour", 120, 18000),
    ],
    "gyms": [
        ("Personal training session", 60, 9000),
        ("Gym tour and trial", 30, 0),
        ("Fitness assessment", 45, 6000),
    ],
    "legal": [
        ("Initial consultation", 30, 7500),
        ("Document review", 60, 25000),
    ],
    "it-support": [
        ("Remote support session", 30, 6500),
        ("On-site visit", 90, 15000),
        ("Network setup", 120, None),
    ],
    "auto-repair": [
        ("Oil change", 45, 8900),
        ("Safety inspection", 60, 14900),
        ("Brake check", 45, None),
    ],
    "plumbers": [
        ("Drain clearing", 90, 18500),
        ("Water heater check", 60, None),
        ("Leak repair", 90, 21000),
    ],
    "electricians": [
        ("Panel inspection", 60, 14000),
        ("Outlet and switch repair", 60, 12000),
        ("Lighting installation", 120, None),
    ],
    "movers": [
        ("Two movers and a truck (3 hours)", 180, 36000),
        ("Packing help", 120, 22000),
        ("Quote visit", 60, 0),
    ],
}


def seed_booking(db: Session) -> Tuple[int, int, int]:
    """Returns (services created, listings switched to requests, listings with services)."""
    slugs = {row[0] for row in BUSINESSES} | {SEED_OWNED_SLUG}
    category_slug_by_id = {c.id: c.slug for c in db.scalars(select(Category)).all()}

    services_created = 0
    switched = 0
    with_services = 0
    for business in db.scalars(select(Business).where(Business.slug.in_(slugs))).all():
        category_slug = category_slug_by_id.get(business.category_id, "")
        if booking_rules.style_for(category_slug) is None:
            continue

        existing = db.scalar(
            select(func.count())
            .select_from(BookableService)
            .where(BookableService.business_id == business.id)
        )
        if not existing:
            for name, minutes, price in SERVICES_BY_CATEGORY.get(category_slug, []):
                db.add(
                    BookableService(
                        business_id=business.id,
                        name=name,
                        duration_minutes=minutes,
                        price_cents=price,
                    )
                )
                services_created += 1
        has_services = bool(existing) or category_slug in SERVICES_BY_CATEGORY
        if has_services:
            with_services += 1

        if has_services and business.booking_mode == "none":
            business.booking_mode = "request"
            business.booking_url = None
            if not business.cancellation_policy:
                business.cancellation_policy = DEFAULT_POLICY
            switched += 1

    db.flush()
    return services_created, switched, with_services


def main() -> int:
    db = SessionLocal()
    try:
        created, switched, total = seed_booking(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print("Booking seed summary")
    print("--------------------")
    print(f"  Services : {created} created")
    print(f"  Listings : {switched} switched to booking requests ({total} bookable in the demo set)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
