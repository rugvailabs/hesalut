"""Demo listings for the service categories added in alembic a7c3e9f1b2d4.

Two invented businesses per category, so every category has something to
browse while the directory is being tested. Like the rest of the seed data
(scripts/seed_directory.py) they are NOT real businesses: plausible names on
real Metro Vancouver streets, fictional 236-555-01xx phone numbers, example.com
websites where a website is shown at all. They carry no rating - a rating is
only ever derived from reviews (app/services/ratings.py) and these have none.

Replace them with real listings before launch; `--undo` removes exactly these
rows (matched on slug) and nothing else.

Idempotent: re-running skips slugs that already exist. The categories must
exist first (`alembic upgrade head`).

    python -m scripts.seed_services            # add the demo listings
    python -m scripts.seed_services --undo     # remove them again
"""

from __future__ import annotations

import sys

from datetime import datetime, timezone

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.verification import BusinessVerification, VerificationStatus

# --------------------------------------------------------------------------
# Where the listings sit: (city, street, postal FSA, lat, lng). Real streets
# and approximate neighbourhood centres; street numbers and the last three
# postal characters are made up.
AREAS = {
    "downtown": ("Vancouver", "Granville St", "V6Z", 49.2805, -123.1225),
    "westend": ("Vancouver", "Denman St", "V6G", 49.2885, -123.1390),
    "gastown": ("Vancouver", "Water St", "V6B", 49.2842, -123.1080),
    "kits": ("Vancouver", "W 4th Ave", "V6K", 49.2682, -123.1665),
    "fairview": ("Vancouver", "W Broadway", "V6H", 49.2632, -123.1310),
    "mountpleasant": ("Vancouver", "Main St", "V5T", 49.2625, -123.1008),
    "commercial": ("Vancouver", "Commercial Dr", "V5L", 49.2710, -123.0697),
    "kerrisdale": ("Vancouver", "W 41st Ave", "V6M", 49.2340, -123.1555),
    "marpole": ("Vancouver", "Granville St", "V6P", 49.2105, -123.1400),
    "hastings": ("Vancouver", "E Hastings St", "V5K", 49.2811, -123.0435),
    "richmond": ("Richmond", "No. 3 Rd", "V6X", 49.1685, -123.1365),
    "metrotown": ("Burnaby", "Kingsway", "V5H", 49.2265, -123.0030),
    "burnabyheights": ("Burnaby", "Hastings St", "V5C", 49.2810, -123.0115),
    "lonsdale": ("North Vancouver", "Lonsdale Ave", "V7M", 49.3195, -123.0725),
    "newwest": ("New Westminster", "Columbia St", "V3M", 49.2045, -122.9105),
    "surrey": ("Surrey", "King George Blvd", "V3T", 49.1885, -122.8480),
    "coquitlam": ("Coquitlam", "Pinetree Way", "V3B", 49.2785, -122.7960),
    "ambleside": ("West Vancouver", "Marine Dr", "V7T", 49.3285, -123.1560),
}

# --------------------------------------------------------------------------
# Opening hours, in the shape seed_directory.HOURS_BY_CATEGORY uses.
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _week(weekday: list[list[str]], sat: list[list[str]], sun: list[list[str]]) -> dict:
    return {d: (sat if d == "sat" else sun if d == "sun" else weekday) for d in DAYS}


HOURS = {
    "trades": _week([["08:00", "17:00"]], [["09:00", "14:00"]], []),
    "office": _week([["09:00", "17:00"]], [], []),
    "retail": _week([["10:00", "18:00"]], [["10:00", "18:00"]], [["11:00", "17:00"]]),
    "clinic": _week([["08:00", "20:00"]], [["09:00", "17:00"]], [["10:00", "16:00"]]),
    "cafe": _week([["07:00", "17:00"]], [["08:00", "17:00"]], [["08:00", "16:00"]]),
    "grocery": _week([["08:00", "22:00"]], [["08:00", "22:00"]], [["09:00", "21:00"]]),
    "always": _week([["00:00", "23:59"]], [["00:00", "23:59"]], [["00:00", "23:59"]]),
    "lessons": _week([["14:00", "20:00"]], [["09:00", "16:00"]], []),
    "childcare": _week([["07:30", "18:00"]], [], []),
}

# --------------------------------------------------------------------------
# category slug -> (hours key, [(slug, name, area, has website, description)])
LISTINGS: dict[str, tuple[str, list[tuple[str, str, str, bool, str]]]] = {
    "hvac": ("trades", [
        ("kits-comfort-heating", "Comfort Line Heating & Cooling", "kits", True, "Furnace and heat pump installs, with rebate paperwork handled."),
        ("metrotown-airflow-hvac", "Airflow HVAC Services", "metrotown", False, "Same-week furnace repair, AC tune-ups and duct cleaning."),
    ]),
    "roofing": ("trades", [
        ("hastings-summit-roofing", "Summit Roofing Co.", "hastings", True, "Asphalt shingle and torch-on roofs, leak repair and gutters."),
        ("surrey-cedar-roofing", "Cedar Ridge Roofing", "surrey", False, "Re-roofs and repairs across the Fraser Valley."),
    ]),
    "cleaning": ("office", [
        ("westend-spotless-cleaning", "Spotless Home Cleaning", "westend", True, "Weekly, deep and move-out cleans; supplies included."),
        ("richmond-brightway-cleaning", "Brightway Commercial Cleaning", "richmond", False, "Office and retail cleaning after hours."),
    ]),
    "pest-control": ("trades", [
        ("commercial-drive-pest-control", "Drive Pest Solutions", "commercial", True, "Mice, rats, ants and bed bugs, with follow-up visits."),
        ("coquitlam-wildlife-pest", "Tri-Cities Pest & Wildlife", "coquitlam", False, "Raccoon and wildlife removal and exclusion work."),
    ]),
    "painters": ("trades", [
        ("fairview-true-colour-painting", "True Colour Painting", "fairview", True, "Interior repaints for condos and houses, drywall patching included."),
        ("lonsdale-northshore-painters", "North Shore Painters", "lonsdale", False, "Exterior painting and cedar staining."),
    ]),
    "landscaping": ("trades", [
        ("kerrisdale-greenleaf-landscaping", "Greenleaf Landscaping", "kerrisdale", True, "Garden design, planting and seasonal maintenance."),
        ("burnaby-heights-lawn-care", "Heights Lawn & Garden", "burnabyheights", False, "Weekly lawn mowing, hedging and yard clean-ups."),
    ]),
    "locksmiths": ("always", [
        ("downtown-keyfast-locksmith", "KeyFast Locksmith", "downtown", False, "24-hour lockouts, rekeying and smart lock installs."),
        ("newwest-royal-city-locks", "Royal City Lock & Safe", "newwest", True, "Residential and commercial locks, safes opened and serviced."),
    ]),
    "handyman": ("trades", [
        ("mountpleasant-fixit-handyman", "Fix-It Handyman", "mountpleasant", False, "Shelves, TV mounting, furniture assembly and small repairs."),
        ("richmond-handy-crew", "Handy Crew Home Services", "richmond", True, "Odd jobs by the hour, with a one-hour minimum."),
    ]),
    "appliance-repair": ("trades", [
        ("marpole-appliance-doctor", "Appliance Doctor", "marpole", True, "Washer, dryer, fridge and oven repair, most brands."),
        ("surrey-quickfix-appliance", "QuickFix Appliance Repair", "surrey", False, "Same-day diagnosis on dishwashers and laundry machines."),
    ]),
    "renovation": ("trades", [
        ("kits-westside-renovations", "Westside Renovations", "kits", True, "Kitchen and bathroom renovations, design to finish."),
        ("coquitlam-basement-builders", "Basement Builders", "coquitlam", False, "Basement suites and legal secondary suites."),
    ]),
    "flooring": ("retail", [
        ("metrotown-floorcraft", "FloorCraft Flooring", "metrotown", True, "Hardwood, vinyl plank and tile, supplied and installed."),
        ("hastings-carpet-and-tile", "East Van Carpet & Tile", "hastings", False, "Carpet, tile and laminate installation and repair."),
    ]),
    "windows-doors": ("trades", [
        ("burnaby-clearview-windows", "ClearView Windows & Doors", "burnabyheights", True, "Energy-efficient window and door replacement."),
        ("lonsdale-glass-works", "Lonsdale Glass Works", "lonsdale", False, "Glass repair, sealed units and patio doors."),
    ]),
    "walk-in-clinics": ("clinic", [
        ("downtown-granville-walkin", "Granville Walk-in Clinic", "downtown", False, "Walk-in and booked appointments with family physicians."),
        ("richmond-centre-medical", "Richmond Centre Medical Clinic", "richmond", True, "Family practice and walk-in care, virtual visits available."),
    ]),
    "pharmacies": ("grocery", [
        ("commercial-drive-pharmacy", "Commercial Drive Pharmacy", "commercial", False, "Prescriptions, flu shots and medication reviews."),
        ("ambleside-village-pharmacy", "Ambleside Village Pharmacy", "ambleside", True, "Compounding, vaccinations and free local delivery."),
    ]),
    "physiotherapy": ("clinic", [
        ("fairview-motion-physio", "Motion Physiotherapy", "fairview", True, "Sports injuries, post-surgery rehab and IMS."),
        ("newwest-riverside-physio", "Riverside Physio & Rehab", "newwest", False, "ICBC and WorkSafeBC claims accepted."),
    ]),
    "chiropractors": ("clinic", [
        ("kits-spine-and-joint", "Kits Spine & Joint", "kits", True, "Chiropractic care for back and neck pain."),
        ("surrey-central-chiro", "Central Chiropractic", "surrey", False, "Adjustments, soft tissue therapy and posture assessments."),
    ]),
    "optometrists": ("retail", [
        ("westend-eyecare", "West End Eyecare", "westend", True, "Eye exams for all ages, frames and contact lenses."),
        ("metrotown-vision-centre", "Metrotown Vision Centre", "metrotown", False, "Optometry exams, dry eye clinic and eyewear."),
    ]),
    "massage-therapy": ("clinic", [
        ("mountpleasant-rmt-studio", "Main Street RMT", "mountpleasant", True, "Registered massage therapy, direct billing to most insurers."),
        ("lonsdale-restore-massage", "Restore Massage Therapy", "lonsdale", False, "Deep tissue, prenatal and sports massage."),
    ]),
    "counselling": ("office", [
        ("fairview-clearpath-counselling", "ClearPath Counselling", "fairview", True, "Individual and couples counselling, in person or online."),
        ("burnaby-harbour-wellness", "Harbour Wellness Counselling", "metrotown", False, "Therapy for anxiety, depression and life transitions."),
    ]),
    "veterinarians": ("clinic", [
        ("commercial-drive-animal-hospital", "Drive Animal Hospital", "commercial", True, "Vaccinations, dental care and surgery for cats and dogs."),
        ("richmond-paws-vet", "Paws & Claws Veterinary", "richmond", False, "Wellness exams and urgent appointments."),
    ]),
    "cafes-bakeries": ("cafe", [
        ("gastown-cobblestone-coffee", "Cobblestone Coffee", "gastown", True, "Espresso bar with pastries baked in-house every morning."),
        ("kerrisdale-crumb-bakery", "Crumb & Co. Bakery", "kerrisdale", False, "Sourdough, croissants and custom cakes."),
    ]),
    "grocery": ("grocery", [
        ("mountpleasant-fresh-market", "Main Street Fresh Market", "mountpleasant", False, "Produce, bulk foods and local dairy."),
        ("surrey-spice-bazaar", "Spice Bazaar Grocery", "surrey", True, "South Asian groceries, spices and fresh sweets."),
    ]),
    "caterers": ("office", [
        ("gastown-long-table-catering", "Long Table Catering", "gastown", True, "Office lunches, weddings and private events."),
        ("burnaby-feast-catering", "Feast Catering Co.", "burnabyheights", False, "Buffet and family-style catering for 20 to 300."),
    ]),
    "car-wash": ("retail", [
        ("marpole-shine-car-wash", "Shine Car Wash & Detail", "marpole", True, "Hand wash, interior detailing and ceramic coating."),
        ("coquitlam-sparkle-auto-spa", "Sparkle Auto Spa", "coquitlam", False, "Touchless wash bays and full detailing packages."),
    ]),
    "towing": ("always", [
        ("hastings-24-towing", "East Side 24 Towing", "hastings", False, "24-hour towing, boosts and lockouts."),
        ("surrey-roadside-assist", "Fraser Roadside Assist", "surrey", True, "Flatbed towing and roadside help across Metro Vancouver."),
    ]),
    "driving-schools": ("lessons", [
        ("richmond-green-light-driving", "Green Light Driving School", "richmond", True, "ICBC road test prep for Class 7 and Class 5."),
        ("newwest-steady-hands-driving", "Steady Hands Driving", "newwest", False, "Patient lessons for new and nervous drivers."),
    ]),
    "tutoring": ("lessons", [
        ("kerrisdale-bright-minds-tutoring", "Bright Minds Tutoring", "kerrisdale", True, "Math, science and English tutoring, grades 1 to 12."),
        ("coquitlam-study-hub", "Study Hub Learning Centre", "coquitlam", False, "Homework help and exam preparation in small groups."),
    ]),
    "childcare": ("childcare", [
        ("kits-little-sprouts-daycare", "Little Sprouts Daycare", "kits", True, "Licensed group care for ages 1 to 5."),
        ("burnaby-maple-tree-preschool", "Maple Tree Preschool", "metrotown", False, "Play-based preschool and before- and after-school care."),
    ]),
    "music-lessons": ("lessons", [
        ("commercial-drive-music-studio", "Drive Music Studio", "commercial", True, "Piano, guitar and voice lessons for all ages."),
        ("lonsdale-harmony-music", "Harmony Music School", "lonsdale", False, "Private lessons and RCM exam preparation."),
    ]),
    "accountants": ("office", [
        ("downtown-ledger-accounting", "Ledger Accounting & Tax", "downtown", True, "Personal and small-business tax returns, bookkeeping and GST filings."),
        ("richmond-pacific-tax", "Pacific Tax Services", "richmond", False, "Tax preparation for individuals, students and newcomers."),
    ]),
    "real-estate": ("office", [
        ("westend-harbourline-realty", "Harbourline Realty", "westend", True, "Condo sales and purchases in downtown Vancouver."),
        ("surrey-open-door-realty", "Open Door Realty Group", "surrey", False, "Buying and selling family homes south of the Fraser."),
    ]),
    "insurance": ("office", [
        ("metrotown-shield-insurance", "Shield Insurance Brokers", "metrotown", True, "Home, auto and tenant insurance quotes."),
        ("newwest-cornerstone-insurance", "Cornerstone Insurance", "newwest", False, "Business and liability insurance for small firms."),
    ]),
    "immigration": ("office", [
        ("downtown-northstar-immigration", "Northstar Immigration Consulting", "downtown", True, "Study permits, work permits and permanent residence applications."),
        ("surrey-new-roots-immigration", "New Roots Immigration", "surrey", False, "Family sponsorship and visitor visas."),
    ]),
    "notaries": ("office", [
        ("kerrisdale-notary-public", "Kerrisdale Notary Public", "kerrisdale", True, "Wills, powers of attorney and property transfers."),
        ("richmond-seal-notary", "Seal & Sign Notary", "richmond", False, "Document notarization and travel consent letters."),
    ]),
    "translators": ("office", [
        ("gastown-wordbridge-translation", "WordBridge Translation", "gastown", True, "Certified translation of documents for immigration and courts."),
        ("metrotown-lingua-services", "Lingua Language Services", "metrotown", False, "Interpreting and translation in over 20 languages."),
    ]),
    "photographers": ("office", [
        ("mountpleasant-silver-frame-photo", "Silver Frame Photography", "mountpleasant", True, "Weddings, family portraits and headshots."),
        ("ambleside-coastline-photo", "Coastline Photography", "ambleside", False, "Outdoor portraits and event photography."),
    ]),
    "event-planners": ("office", [
        ("fairview-golden-hour-events", "Golden Hour Events", "fairview", True, "Wedding planning and day-of coordination."),
        ("richmond-celebrate-events", "Celebrate Event Planning", "richmond", False, "Birthdays, corporate events and cultural celebrations."),
    ]),
    "print-copy": ("retail", [
        ("downtown-printpoint", "PrintPoint Copy Centre", "downtown", True, "Printing, copying, posters and business cards while you wait."),
        ("burnaby-sign-and-print", "Heights Sign & Print", "burnabyheights", False, "Signs, banners and vehicle decals."),
    ]),
    "barbers": ("retail", [
        ("gastown-sharp-barbers", "Sharp Barbers", "gastown", False, "Cuts, fades and hot-towel shaves; walk-ins welcome."),
        ("newwest-classic-cuts", "Classic Cuts Barbershop", "newwest", True, "Traditional barbering and beard trims."),
    ]),
    "tailors": ("retail", [
        ("westend-stitch-tailors", "Stitch Tailoring & Alterations", "westend", False, "Hemming, suit alterations and repairs."),
        ("metrotown-fine-fit-tailors", "Fine Fit Tailors", "metrotown", True, "Custom suits and wedding dress alterations."),
    ]),
    "dry-cleaners": ("retail", [
        ("kits-fresh-press-cleaners", "Fresh Press Cleaners", "kits", False, "Dry cleaning, laundry and shirt service."),
        ("coquitlam-green-clean", "Green Clean Dry Cleaners", "coquitlam", True, "Eco-friendly dry cleaning with pickup and delivery."),
    ]),
    "pet-grooming": ("retail", [
        ("commercial-drive-pampered-paws", "Pampered Paws Grooming", "commercial", True, "Full grooms, baths and nail trims for dogs and cats."),
        ("lonsdale-waggy-tails", "Waggy Tails Grooming", "lonsdale", False, "Grooming by appointment, with a gentle approach for anxious dogs."),
    ]),
    "device-repair": ("retail", [
        ("downtown-fixmyphone", "FixMyPhone Repair", "downtown", True, "Screen and battery replacement, most repairs same day."),
        ("richmond-laptop-lab", "Laptop Lab Repair", "richmond", False, "Laptop, tablet and data recovery repairs."),
    ]),
    "bike-shops": ("retail", [
        ("mountpleasant-spoke-and-chain", "Spoke & Chain Bicycles", "mountpleasant", True, "New and used bikes, tune-ups and repairs."),
        ("lonsdale-trailhead-cycles", "Trailhead Cycles", "lonsdale", False, "Mountain bike sales, rentals and servicing."),
    ]),
}


def _rows():
    """Every listing as the field values it needs, numbered for phone and address."""
    n = 0
    for category_slug, (hours_key, entries) in LISTINGS.items():
        for slug, name, area, has_website, description in entries:
            city, street, fsa, lat, lng = AREAS[area]
            # A small, stable offset so two listings in one area don't share a pin.
            nudge = ((n % 7) - 3) * 0.0012
            yield category_slug, {
                "slug": slug,
                "name": name,
                "description": description,
                "address": f"{1000 + n * 37 % 3000} {street}",
                "city": city,
                "province": "BC",
                "postal_code": f"{fsa} {n % 9 + 1}{chr(65 + n % 26)}{(n * 3) % 10}",
                "latitude": round(lat + nudge, 5),
                "longitude": round(lng - nudge, 5),
                # 555-0100..0199 is the North American range set aside for
                # fiction; 236 is a Lower Mainland area code the other seed
                # data doesn't use.
                "phone": f"+1-236-555-01{n:02d}",
                "website": f"https://example.com/{slug}" if has_website else None,
                "opening_hours": HOURS[hours_key],
            }
            n += 1


def seed(db) -> tuple[int, int]:
    """Create any missing demo listings, approved and KYC-verified. Returns (created, total)."""
    by_slug = {c.slug: c for c in db.scalars(select(Category)).all()}
    missing = sorted({slug for slug in LISTINGS} - by_slug.keys())
    if missing:
        raise RuntimeError(
            f"categories missing ({', '.join(missing)}) - run `alembic upgrade head` first"
        )

    created = total = 0
    for category_slug, values in _rows():
        total += 1
        if db.scalar(select(Business.id).where(Business.slug == values["slug"])) is not None:
            continue
        business = Business(
            **values,
            category_id=by_slug[category_slug].id,
            rating=None,
            review_count=0,
            verified=True,
            is_active=True,
            status=BusinessStatus.approved,
        )
        db.add(business)
        db.flush()
        # Search shows only approved AND KYC-verified listings. Verified here,
        # for these rows only - never through a sweep over every listing,
        # which on a live database would verify real owners nobody reviewed.
        db.add(
            BusinessVerification(
                business_id=business.id,
                email=f"owner@{business.slug}.example.ca",
                mobile_number=values["phone"],
                license_number=f"BC-DEMO-{business.id:06d}",
                gst_number=None,
                status=VerificationStatus.verified,
                reviewed_at=datetime.now(timezone.utc),
            )
        )
        created += 1
    db.flush()
    return created, total


def undo(db) -> int:
    slugs = [values["slug"] for _, values in _rows()]
    businesses = list(db.scalars(select(Business).where(Business.slug.in_(slugs))).all())
    # Through the ORM, one by one, so the model's cascades remove what hangs
    # off a listing (verification, enquiries, reviews...) instead of the
    # delete failing on a foreign key.
    for business in businesses:
        db.delete(business)
    db.flush()
    return len(businesses)


def main() -> int:
    db = SessionLocal()
    try:
        if "--undo" in sys.argv:
            removed = undo(db)
            db.commit()
            print(f"Removed {removed} demo service listings.")
        else:
            created, total = seed(db)
            db.commit()
            print(f"Demo service listings: {created} created, {total - created} already present.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
