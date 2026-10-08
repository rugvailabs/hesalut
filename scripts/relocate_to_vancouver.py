"""One-off: move the existing seeded catalogue from Toronto to Vancouver.

Updates the 34 seeded rows IN PLACE rather than deleting and reseeding. That
matters because reviews, enquiries and chat threads reference businesses.id: a
delete would CASCADE and take the demo history with it, while an update leaves
every child row attached to the same listing, now in a different city.

Matched on either the old Toronto slug or the new Vancouver one, so the script
is idempotent and also repairs a partially-applied run.

    python -m scripts.relocate_to_vancouver
"""

from __future__ import annotations

import sys

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.business import Business
from scripts.seed_directory import BUSINESSES

# Position N here is position N in BUSINESSES: the rewrite preserved category,
# rating and review_count per slot, so this pairing is exact.
OLD_SLUGS = [
    "harbourfront-plumbing",
    "kensington-drain-works",
    "leslieville-pipe-co",
    "north-york-plumbing-group",
    "mississauga-flow-services",
    "queen-west-electric",
    "liberty-village-electrical",
    "scarborough-current-co",
    "etobicoke-voltage",
    "the-annex-kitchen",
    "kensington-taco-bar",
    "distillery-pasta-house",
    "beaches-brunch-room",
    "markham-dumpling-house",
    "yorkville-steak-social",
    "bay-street-dental",
    "danforth-family-dentistry",
    "north-york-smile-studio",
    "dupont-auto-works",
    "scarborough-tire-centre",
    "etobicoke-collision-care",
    "king-west-strength",
    "riverdale-yoga-loft",
    "mississauga-fitness-hub",
    "ossington-hair-atelier",
    "yorkville-skin-spa",
    "north-york-nail-bar",
    "six-city-movers",
    "gta-storage-and-haul",
    "bloor-tech-support",
    "scarborough-pc-clinic",
    "adelaide-legal-partners",
    "dundas-immigration-law",
    "mississauga-family-law-office",
]

# The seeded pending listing: place changes, content does not.
PLACE_ONLY = {
    "osei-drain-specialists": (
        "Vancouver",
        "250 Powell St",
        "V6A 1G4",
        49.2830,
        -123.0980,
    ),
}


def main() -> int:
    if len(OLD_SLUGS) != len(BUSINESSES):
        print(f"Refusing to run: {len(OLD_SLUGS)} old slugs vs {len(BUSINESSES)} new")
        return 1

    db = SessionLocal()
    moved = placed = untouched = strays = 0
    try:
        fixture_slugs: set[str] = set()

        for old_slug, spec in zip(OLD_SLUGS, BUSINESSES):
            (
                slug, name, _category_slug, city, address, postal,
                lat, lng, phone, website, _verified, description,
            ) = spec
            fixture_slugs.add(slug)

            # Either slug matches, so a re-run repairs rather than skips.
            business = db.scalar(
                select(Business).where(Business.slug.in_([old_slug, slug]))
            )
            if business is None:
                untouched += 1
                continue

            business.slug = slug
            business.name = name
            business.city = city
            business.province = "BC"
            business.address = address
            business.postal_code = postal
            business.latitude = lat
            business.longitude = lng
            business.phone = phone
            business.website = website
            business.description = description
            # rating/review_count are left alone: for a listing with real
            # reviews they are a computed aggregate, and overwriting them with
            # the fixture's placeholder would contradict its own reviews.
            moved += 1

        for slug, (city, address, postal, lat, lng) in PLACE_ONLY.items():
            fixture_slugs.add(slug)
            business = db.scalar(select(Business).where(Business.slug == slug))
            if business is None:
                continue
            business.city = city
            business.province = "BC"
            business.address = address
            business.postal_code = postal
            business.latitude = lat
            business.longitude = lng
            placed += 1

        # Flush first: without this the query below still sees the pre-update
        # province and sweeps up every row we just relocated.
        db.flush()

        # Anything left is a listing a real person created. Move the place so
        # the catalogue is coherent, but never touch their name, description or
        # address - that is their content. Coordinates are cleared only if they
        # are still in Ontario, where they would otherwise point at the wrong
        # side of the country.
        for business in db.scalars(
            select(Business).where(Business.slug.not_in(fixture_slugs))
        ).all():
            if business.province == "BC":
                continue
            business.city = "Vancouver"
            business.province = "BC"
            if business.latitude is not None and business.latitude > 45:
                business.latitude = None
                business.longitude = None
            strays += 1

        db.commit()
    finally:
        db.close()

    print(f"  relocated from fixture : {moved}")
    print(f"  place-only updates     : {placed}")
    print(f"  user listings moved    : {strays}")
    print(f"  not found              : {untouched}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
