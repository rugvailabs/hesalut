"""Directory seed data: categories and Vancouver-area business listings.

Imported by scripts.seed so `python -m scripts.seed` populates everything.

All business names, addresses, phone numbers and websites below are invented.
They are shaped like real Vancouver listings so the search, distance and rating
filters have something plausible to work on - they are not real businesses.

Coordinates are real neighbourhood centroids, which is what makes the "near me"
path testable: the reference point used in development is downtown Vancouver at
(49.28, -123.12).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business import Business, BusinessStatus
from app.models.verification import BusinessVerification, VerificationStatus
from app.models.business_review import BusinessReview
from app.models.category import Category
from app.models.enquiry import Enquiry, EnquiryType
from app.models.user import User, UserRole

# (slug, name, icon, sort_order, description)
CATEGORIES: List[Tuple[str, str, str, int, str]] = [
    ("plumbers", "Plumbers", "🔧", 10, "Leaks, drains, water heaters and emergency callouts."),
    ("electricians", "Electricians", "💡", 20, "Wiring, panel upgrades, lighting and ESA inspections."),
    ("restaurants", "Restaurants", "🍽️", 30, "Places to eat, from counter service to fine dining."),
    ("dentists", "Dentists", "🦷", 40, "General dentistry, hygiene and cosmetic work."),
    ("auto-repair", "Auto Repair", "🚗", 50, "Mechanics, bodywork, tires and safety certificates."),
    ("gyms", "Gyms & Fitness", "🏋️", 60, "Gyms, studios and personal training."),
    ("salons", "Salons & Spas", "💇", 70, "Hair, nails, skincare and massage."),
    ("movers", "Movers & Storage", "📦", 80, "Local and long-distance moving, packing and storage."),
    ("it-support", "IT Support", "💻", 90, "Managed IT, repairs and small-business networking."),
    ("legal", "Legal Services", "⚖️", 100, "Family, immigration, real estate and small-claims law."),
    # Travel-adjacent, and both are businesses a directory lists rather than
    # products it sells. Flights, buses and trains are ticketing, which is a
    # different product entirely - see the homepage tiles.
    ("hotels", "Hotels & Stays", "🏨", 110, "Hotels, inns and short-stay accommodation."),
    ("car-rentals", "Car Rentals", "🚗", 120, "Daily and weekly car, van and truck hire."),
]

# Opening hours, by category.
#
# Stored the way app/models/business.py holds them - {"mon": [["09:00","17:00"]]}
# - with an absent or empty day meaning closed. Assigned per category rather
# than per listing because the trade is what actually determines them: a
# plumber opens before an office does, and a salon is shut on Monday.
#
# Two shapes here exist to exercise the reader rather than to decorate the
# seed. Restaurants carry a split service - lunch, a gap, then dinner - which a
# renderer that flattens ranges would wrongly show as open all afternoon. Their
# Friday and Saturday close at 00:30, which is before the open time and so
# crosses midnight; getOpenState() handles that, and nothing else in the seed
# would prove it.
HOURS_BY_CATEGORY: dict[str, dict[str, list[list[str]]]] = {
    "plumbers": {
        "mon": [["07:00", "18:00"]], "tue": [["07:00", "18:00"]],
        "wed": [["07:00", "18:00"]], "thu": [["07:00", "18:00"]],
        "fri": [["07:00", "18:00"]], "sat": [["08:00", "16:00"]], "sun": [],
    },
    "electricians": {
        "mon": [["08:00", "17:00"]], "tue": [["08:00", "17:00"]],
        "wed": [["08:00", "17:00"]], "thu": [["08:00", "17:00"]],
        "fri": [["08:00", "17:00"]], "sat": [["09:00", "14:00"]], "sun": [],
    },
    "restaurants": {
        "mon": [["11:30", "14:30"], ["17:00", "22:00"]],
        "tue": [["11:30", "14:30"], ["17:00", "22:00"]],
        "wed": [["11:30", "14:30"], ["17:00", "22:00"]],
        "thu": [["11:30", "14:30"], ["17:00", "22:00"]],
        "fri": [["11:30", "14:30"], ["17:00", "00:30"]],
        "sat": [["11:30", "15:00"], ["17:00", "00:30"]],
        "sun": [["17:00", "21:00"]],
    },
    "dentists": {
        "mon": [["08:00", "18:00"]], "tue": [["08:00", "18:00"]],
        "wed": [["08:00", "18:00"]], "thu": [["08:00", "18:00"]],
        "fri": [["08:00", "15:00"]], "sat": [], "sun": [],
    },
    "auto-repair": {
        "mon": [["07:30", "17:30"]], "tue": [["07:30", "17:30"]],
        "wed": [["07:30", "17:30"]], "thu": [["07:30", "17:30"]],
        "fri": [["07:30", "17:30"]], "sat": [["08:00", "13:00"]], "sun": [],
    },
    "gyms": {
        "mon": [["05:00", "23:00"]], "tue": [["05:00", "23:00"]],
        "wed": [["05:00", "23:00"]], "thu": [["05:00", "23:00"]],
        "fri": [["05:00", "22:00"]], "sat": [["07:00", "21:00"]],
        "sun": [["07:00", "21:00"]],
    },
    "salons": {
        "mon": [], "tue": [["10:00", "19:00"]], "wed": [["10:00", "19:00"]],
        "thu": [["10:00", "20:00"]], "fri": [["10:00", "20:00"]],
        "sat": [["09:00", "18:00"]], "sun": [],
    },
    "movers": {
        "mon": [["08:00", "18:00"]], "tue": [["08:00", "18:00"]],
        "wed": [["08:00", "18:00"]], "thu": [["08:00", "18:00"]],
        "fri": [["08:00", "18:00"]], "sat": [["08:00", "17:00"]], "sun": [],
    },
    "it-support": {
        "mon": [["09:00", "17:00"]], "tue": [["09:00", "17:00"]],
        "wed": [["09:00", "17:00"]], "thu": [["09:00", "17:00"]],
        "fri": [["09:00", "17:00"]], "sat": [], "sun": [],
    },
    "legal": {
        "mon": [["09:00", "17:00"]], "tue": [["09:00", "17:00"]],
        "wed": [["09:00", "17:00"]], "thu": [["09:00", "17:00"]],
        "fri": [["09:00", "16:00"]], "sat": [], "sun": [],
    },
    # A front desk that never closes: 00:00-23:59 rather than a range that
    # crosses midnight, because "open 24 hours" is not the same shape as
    # "closes at 2am" and getOpenState treats them differently.
    "hotels": {day: [["00:00", "23:59"]] for day in
               ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
    "car-rentals": {
        "mon": [["07:30", "18:00"]], "tue": [["07:30", "18:00"]],
        "wed": [["07:30", "18:00"]], "thu": [["07:30", "18:00"]],
        "fri": [["07:30", "19:00"]], "sat": [["08:00", "17:00"]],
        "sun": [["09:00", "15:00"]],
    },
}

# (slug, name, category_slug, city, address, postal, lat, lng, phone, website,
#  verified, description)
#
# There is deliberately no rating here. A listing's rating is derived from its
# reviews (app/services/ratings.py) - seeding a number with no reviews behind it
# is what left most of the directory showing stars nobody gave. Listings without
# a seeded review stay "No reviews yet", which also exercises the NULL handling
# in ?min_rating and the rating sort.
BUSINESSES = [
    # --- plumbers -----------------------------------------------------------
    ("coal-harbour-plumbing", "Coal Harbour Plumbing", "plumbers", "Vancouver", "1055 Canada Pl", "V6C 0C3", 49.2888, -123.1150, "+1-604-555-0101", "https://example.com/coal-harbour-plumbing", True, "24-hour emergency plumbing and drain clearing across the downtown peninsula."),
    ("kitsilano-drain-works", "Kitsilano Drain Works", "plumbers", "Vancouver", "2088 W 4th Ave", "V6J 1M9", 49.2685, -123.1560, "+1-604-555-0102", None, True, "Drain snaking, camera inspection and backwater valve installation."),
    ("commercial-drive-pipe-co", "Commercial Drive Pipe Co.", "plumbers", "Vancouver", "1721 Commercial Dr", "V5N 4A3", 49.2690, -123.0700, "+1-604-555-0103", "https://example.com/commercial-drive-pipe", False, "Residential repiping and hot water tank replacement."),
    ("north-shore-plumbing-group", "North Shore Plumbing Group", "plumbers", "North Vancouver", "1450 Marine Dr", "V7P 1T7", 49.3245, -123.0870, "+1-604-555-0104", None, False, "Condo and low-rise plumbing maintenance contracts."),
    ("richmond-flow-services", "Richmond Flow Services", "plumbers", "Richmond", "6060 Minoru Blvd", "V6Y 2V7", 49.1666, -123.1336, "+1-604-555-0105", "https://example.com/richmond-flow", True, "Sump pumps, backflow testing and crawlspace waterproofing."),

    # --- electricians -------------------------------------------------------
    ("gastown-electric", "Gastown Electric", "electricians", "Vancouver", "1 Water St", "V6B 1A1", 49.2846, -123.1065, "+1-604-555-0111", "https://example.com/gastown-electric", True, "Panel upgrades, knob-and-tube replacement and EV chargers."),
    ("yaletown-electrical", "Yaletown Electrical", "electricians", "Vancouver", "1155 Mainland St", "V6B 5P2", 49.2745, -123.1210, "+1-604-555-0112", None, True, "Condo lighting design and smart-home wiring."),
    ("surrey-current-co", "Surrey Current Co.", "electricians", "Surrey", "10250 City Pkwy", "V3T 4Z6", 49.1913, -122.8490, "+1-604-555-0113", None, False, "Residential rewiring and generator hookups."),
    ("burnaby-voltage", "Burnaby Voltage", "electricians", "Burnaby", "4700 Kingsway", "V5H 4M1", 49.2260, -122.9990, "+1-604-555-0114", "https://example.com/burnaby-voltage", False, "New electrical contractor serving south Burnaby."),

    # --- restaurants --------------------------------------------------------
    ("the-mount-pleasant-kitchen", "The Mount Pleasant Kitchen", "restaurants", "Vancouver", "2410 Main St", "V5T 3E2", 49.2640, -123.1000, "+1-604-555-0121", "https://example.com/mount-pleasant-kitchen", True, "Seasonal BC produce, open kitchen, walk-ins welcome."),
    ("gastown-taco-bar", "Gastown Taco Bar", "restaurants", "Vancouver", "212 Carrall St", "V6B 2J1", 49.2828, -123.1040, "+1-604-555-0122", None, True, "Counter-service tacos and aguas frescas off Maple Tree Square."),
    ("yaletown-pasta-house", "Yaletown Pasta House", "restaurants", "Vancouver", "1130 Hamilton St", "V6B 5P6", 49.2750, -123.1215, "+1-604-555-0123", "https://example.com/yaletown-pasta", True, "Hand-rolled pasta in a converted warehouse."),
    ("kits-beach-brunch-room", "Kits Beach Brunch Room", "restaurants", "Vancouver", "1305 Arbutus St", "V6J 5N2", 49.2720, -123.1530, "+1-604-555-0124", None, False, "All-day breakfast a block from the seawall."),
    ("richmond-dumpling-house", "Richmond Dumpling House", "restaurants", "Richmond", "8181 Cambie Rd", "V6X 3X9", 49.1830, -123.1160, "+1-604-555-0125", None, True, "Hand-folded dumplings and hot-and-sour soup."),
    ("west-end-steak-social", "West End Steak Social", "restaurants", "Vancouver", "1216 Robson St", "V6E 1C1", 49.2860, -123.1290, "+1-604-555-0126", "https://example.com/west-end-steak", False, "Dry-aged steaks and a long cocktail list."),

    # --- dentists -----------------------------------------------------------
    ("burrard-street-dental", "Burrard Street Dental", "dentists", "Vancouver", "1050 Burrard St", "V6Z 2S3", 49.2790, -123.1290, "+1-604-555-0131", "https://example.com/burrard-street-dental", True, "Downtown practice with evening hours for office workers."),
    ("commercial-drive-family-dentistry", "Commercial Drive Family Dentistry", "dentists", "Vancouver", "1580 Commercial Dr", "V5L 3Y2", 49.2700, -123.0700, "+1-604-555-0132", None, True, "Family dentistry, hygiene and Invisalign."),
    ("north-shore-smile-studio", "North Shore Smile Studio", "dentists", "North Vancouver", "123 Lonsdale Ave", "V7M 2E6", 49.3200, -123.0724, "+1-604-555-0133", None, False, "Cosmetic dentistry and whitening."),

    # --- auto-repair --------------------------------------------------------
    ("clark-drive-auto-works", "Clark Drive Auto Works", "auto-repair", "Vancouver", "1290 Clark Dr", "V5L 3K7", 49.2700, -123.0770, "+1-604-555-0141", "https://example.com/clark-drive-auto", True, "Independent mechanics for European and Japanese cars."),
    ("surrey-tire-centre", "Surrey Tire Centre", "auto-repair", "Surrey", "13450 104 Ave", "V3T 1V8", 49.1900, -122.8460, "+1-604-555-0142", None, False, "Tires, alignment and seasonal storage."),
    ("burnaby-collision-care", "Burnaby Collision Care", "auto-repair", "Burnaby", "4180 Still Creek Dr", "V5C 6C6", 49.2610, -122.9950, "+1-604-555-0143", None, False, "Insurance-approved collision and paint work."),

    # --- gyms ---------------------------------------------------------------
    ("yaletown-strength", "Yaletown Strength", "gyms", "Vancouver", "1010 Mainland St", "V6B 2T4", 49.2757, -123.1195, "+1-604-555-0151", "https://example.com/yaletown-strength", True, "Barbell-focused gym with coaching and open gym hours."),
    ("kitsilano-yoga-loft", "Kitsilano Yoga Loft", "gyms", "Vancouver", "2233 W Broadway", "V6K 2E4", 49.2640, -123.1580, "+1-604-555-0152", None, True, "Vinyasa, yin and beginner series."),
    ("metrotown-fitness-hub", "Metrotown Fitness Hub", "gyms", "Burnaby", "4720 Kingsway", "V5H 4N2", 49.2265, -122.9985, "+1-604-555-0153", None, False, "24-hour access gym with cardio and free weights."),

    # --- salons -------------------------------------------------------------
    ("main-street-hair-atelier", "Main Street Hair Atelier", "salons", "Vancouver", "3610 Main St", "V5V 3N4", 49.2520, -123.1010, "+1-604-555-0161", "https://example.com/main-street-hair", True, "Cuts, colour and balayage."),
    ("robson-skin-spa", "Robson Skin Spa", "salons", "Vancouver", "1080 Robson St", "V6E 1A8", 49.2845, -123.1250, "+1-604-555-0162", None, True, "Facials, peels and laser treatments."),
    ("lougheed-nail-bar", "Lougheed Nail Bar", "salons", "Burnaby", "9855 Austin Ave", "V3J 1N4", 49.2500, -122.8960, "+1-604-555-0163", None, False, "Manicures, pedicures and gel extensions."),

    # --- movers -------------------------------------------------------------
    ("lower-mainland-movers", "Lower Mainland Movers", "movers", "Vancouver", "350 W Georgia St", "V6B 6B1", 49.2800, -123.1150, "+1-604-555-0171", "https://example.com/lower-mainland-movers", True, "Local moves, packing services and short-term storage."),
    ("fraser-storage-and-haul", "Fraser Storage & Haul", "movers", "Burnaby", "3855 Henning Dr", "V5C 6N3", 49.2620, -122.9930, "+1-604-555-0172", None, False, "Heated storage units and junk removal."),

    # --- it-support ---------------------------------------------------------
    ("broadway-tech-support", "Broadway Tech Support", "it-support", "Vancouver", "555 W Broadway", "V5Z 1E9", 49.2630, -123.1160, "+1-604-555-0181", "https://example.com/broadway-tech", True, "Managed IT and helpdesk for small offices."),
    ("richmond-pc-clinic", "Richmond PC Clinic", "it-support", "Richmond", "4380 No 3 Rd", "V6X 3V9", 49.1780, -123.1360, "+1-604-555-0182", None, False, "Laptop repair, data recovery and virus removal."),

    # --- legal --------------------------------------------------------------
    ("howe-street-legal-partners", "Howe Street Legal Partners", "legal", "Vancouver", "700 W Georgia St", "V7Y 1K8", 49.2830, -123.1180, "+1-604-555-0191", "https://example.com/howe-street-legal", True, "Real estate closings, wills and small-business law."),
    ("pender-immigration-law", "Pender Immigration Law", "legal", "Vancouver", "543 W Pender St", "V6B 1V4", 49.2830, -123.1120, "+1-604-555-0192", None, True, "Express Entry, sponsorship and study permits."),
    ("new-west-family-law-office", "New West Family Law Office", "legal", "New Westminster", "620 Sixth St", "V3L 3C1", 49.2057, -122.9110, "+1-604-555-0193", None, False, "Separation agreements and custody matters."),
    # --- hotels ------------------------------------------------------------
    ("coal-harbour-harbourview-hotel", "Harbourview Hotel Coal Harbour", "hotels", "Vancouver", "1180 W Hastings St", "V6E 4R5", 49.2884, -123.1230, "+1-604-555-0201", "https://example.com/harbourview-hotel", True, "Waterfront rooms a short walk from the convention centre and the seawall."),
    ("gastown-brick-and-beam-inn", "Brick & Beam Inn", "hotels", "Vancouver", "310 Water St", "V6B 1B6", 49.2841, -123.1075, "+1-604-555-0202", None, True, "Converted heritage warehouse with 28 rooms in the middle of Gastown."),
    ("mount-pleasant-yard-hotel", "The Yard Hotel", "hotels", "Vancouver", "2255 Main St", "V5T 3C7", 49.2635, -123.1005, "+1-604-555-0203", "https://example.com/yard-hotel", True, "Small independent hotel on Main, with parking and long-stay rates."),
    ("richmond-airport-transit-suites", "Airport Transit Suites", "hotels", "Richmond", "9800 Bridgeport Rd", "V6X 1S3", 49.1935, -123.1180, "+1-604-555-0204", None, False, "Shuttle to YVR every twenty minutes, twenty-four hours."),

    # --- car rentals -------------------------------------------------------
    ("downtown-westcoast-car-hire", "West Coast Car Hire", "car-rentals", "Vancouver", "1055 Alberni St", "V6E 1A1", 49.2856, -123.1245, "+1-604-555-0211", "https://example.com/westcoast-car-hire", True, "Compacts through to seven-seaters, with winter tyres from November."),
    ("mount-pleasant-broadway-van-rental", "Broadway Van Rental", "car-rentals", "Vancouver", "180 W Broadway", "V5Y 1P4", 49.2632, -123.1085, "+1-604-555-0212", None, True, "Cargo vans and small trucks by the day, for moves and deliveries."),
    ("richmond-yvr-rentals", "YVR Rentals Richmond", "car-rentals", "Richmond", "5911 Minoru Blvd", "V6X 4C7", 49.1690, -123.1370, "+1-604-555-0213", "https://example.com/yvr-rentals", True, "Airport pickup and one-way hire across the Lower Mainland."),
    ("north-shore-mountain-auto-hire", "Mountain Auto Hire", "car-rentals", "North Vancouver", "1405 Marine Dr", "V7P 1T4", 49.3240, -123.0885, "+1-604-555-0214", None, False, "New depot on the North Shore, opening with ten vehicles."),
]


def seed_categories(db: Session) -> Tuple[int, int]:
    """Create any missing categories, matching on slug. Returns (created, total)."""
    created = 0
    for slug, name, icon, sort_order, description in CATEGORIES:
        existing = db.scalar(select(Category).where(Category.slug == slug))
        if existing is None:
            db.add(
                Category(
                    slug=slug,
                    name=name,
                    icon=icon,
                    sort_order=sort_order,
                    description=description,
                    parent_id=None,
                )
            )
            created += 1
    db.flush()
    return created, len(CATEGORIES)


def seed_businesses(db: Session) -> Tuple[int, int]:
    """Create any missing listings, matching on slug. Returns (created, total)."""
    by_slug = {c.slug: c for c in db.scalars(select(Category)).all()}
    created = 0
    for row in BUSINESSES:
        (
            slug, name, category_slug, city, address, postal,
            lat, lng, phone, website, verified, description,
        ) = row

        if db.scalar(select(Business).where(Business.slug == slug)) is not None:
            continue

        category = by_slug.get(category_slug)
        if category is None:
            # A typo in the fixture would otherwise fail with a confusing
            # NOT NULL violation on category_id much later.
            raise RuntimeError(
                f"business {slug!r} references unknown category {category_slug!r}"
            )

        db.add(
            Business(
                slug=slug,
                name=name,
                category_id=category.id,
                city=city,
                province="BC",
                address=address,
                postal_code=postal,
                latitude=lat,
                longitude=lng,
                phone=phone,
                website=website,
                rating=None,
                review_count=0,
                verified=verified,
                is_active=True,
                description=description,
                opening_hours=HOURS_BY_CATEGORY.get(category_slug),
                # The fixture exists to produce a directory somebody can
                # browse. Leaving these pending - the model default - is
                # why a freshly seeded category reported zero listings:
                # visibility needs approved AND verified, and
                # seed_verifications only verifies what is already
                # approved. The pending listings that demo the owner
                # dashboard are seeded in seed_ownership instead.
                status=BusinessStatus.approved,
            )
        )
        created += 1

    db.flush()
    backfill_hours(db, by_slug)
    backfill_fixture_status(db)
    return created, len(BUSINESSES)


def backfill_fixture_status(db: Session) -> int:
    """Approve fixture listings left pending by an earlier run.

    Only rows in BUSINESSES, and only ones no moderator has touched
    (moderated_at IS NULL), so a listing somebody deliberately rejected or
    suspended is never quietly re-approved by re-running the seed.
    """
    slugs = [row[0] for row in BUSINESSES]
    changed = 0
    for business in db.scalars(
        select(Business).where(
            Business.slug.in_(slugs),
            Business.status == BusinessStatus.pending,
            Business.moderated_at.is_(None),
        )
    ).all():
        business.status = BusinessStatus.approved
        changed += 1
    db.flush()
    return changed


def backfill_hours(db: Session, by_slug: dict) -> int:
    """Give listings seeded before hours existed the same per-category pattern.

    seed_businesses() skips any slug already present, so adding opening_hours
    to the fixture alone would leave every existing row null - which is exactly
    the state that made the profile page's hours panel unreachable. Only rows
    that have none are touched, so an owner who set their own keeps them.
    """
    by_id = {category.id: slug for slug, category in by_slug.items()}
    filled = 0
    for business in db.scalars(
        select(Business).where(Business.opening_hours.is_(None))
    ).all():
        hours = HOURS_BY_CATEGORY.get(by_id.get(business.category_id, ""))
        if hours is None:
            continue
        business.opening_hours = hours
        filled += 1
    db.flush()
    return filled


# (business slug, reviewer name, reviewer email, rating, title, body, owner_reply)
#
# Reviewers are ordinary customer accounts created by the seed, so the
# one-review-per-user unique constraint has real users behind it.
#
# `owner_reply` is None for most. The 2-star entry below carries one on
# purpose: it is the fixture for "owner replies, and the reply shows on the
# public listing page", so that path has data without anyone having to click
# through the dashboard first. A low rating with a reply is also the realistic
# case - it is the bad reviews owners answer.
SEED_REVIEWS = [
    ("coal-harbour-plumbing", "Priya Raman", "priya.raman@example.ca", 5,
     "Came out at 11pm", "Burst pipe on a Sunday night and they were here within the hour. Fair price, no fuss.",
     None),
    ("coal-harbour-plumbing", "Tom Beckett", "tom.beckett@example.ca", 4,
     "Solid work, slow to quote", "The repair itself was excellent. Took three days to get the written quote though.",
     None),
    ("coal-harbour-plumbing", "Aisha Noor", "aisha.noor@example.ca", 3,
     "Fine, but pricey", "Job was done properly. Felt expensive for what turned out to be a 40 minute fix.",
     None),
    ("coal-harbour-plumbing", "Elena Novak", "elena.novak@example.ca", 2,
     "Missed the appointment window", "Booked 9-11am, plumber arrived at 3pm with no call ahead.",
     "Sorry about the window - that was a dispatch error on our side and we have credited the callout fee."),
    ("gastown-electric", "Marcus Webb", "marcus.webb@example.ca", 5,
     "Panel upgrade done right", "ESA paperwork handled, site left spotless. Would use again.",
     None),
    ("the-mount-pleasant-kitchen", "Sofia Marino", "sofia.marino@example.ca", 4,
     "Lovely room, tight tables", "Food was genuinely excellent. Bring a small bag, it is snug.",
     None),
]

SEED_REVIEWER_PASSWORD = "reviewerpass123"


def seed_reviews(db: Session) -> Tuple[int, int]:
    """Create missing reviews, then refresh every listing's rating from them.

    Idempotent on (business, author). The refresh covers every listing, not
    just the reviewed ones, so re-seeding a database created before ratings
    were derived clears the old placeholder numbers too.
    """
    from datetime import datetime, timezone

    from app.core.security import hash_password
    from app.services.ratings import recalculate_all_ratings

    created = 0

    for slug, name, email, rating, title, body, owner_reply in SEED_REVIEWS:
        business = db.scalar(select(Business).where(Business.slug == slug))
        if business is None:
            continue

        author = db.scalar(select(User).where(User.email == email))
        if author is None:
            author = User(
                name=name,
                email=email,
                hashed_password=hash_password(SEED_REVIEWER_PASSWORD),
                role=UserRole.customer,
            )
            db.add(author)
            db.flush()

        existing = db.scalar(
            select(BusinessReview).where(
                BusinessReview.business_id == business.id,
                BusinessReview.user_id == author.id,
            )
        )
        if existing is not None:
            # Converge on the declared state without clobbering a real reply:
            # backfill only when the fixture specifies one and the row has
            # none. An owner's own reply, typed in the dashboard, is left be.
            if owner_reply is not None and existing.owner_reply is None:
                existing.owner_reply = owner_reply
                existing.owner_replied_at = datetime.now(timezone.utc)
            continue

        db.add(
            BusinessReview(
                business_id=business.id,
                user_id=author.id,
                rating=rating,
                title=title,
                body=body,
                owner_reply=owner_reply,
                owner_replied_at=(
                    datetime.now(timezone.utc) if owner_reply is not None else None
                ),
            )
        )
        created += 1

    db.flush()
    recalculate_all_ratings(db)
    db.flush()
    return created, len(SEED_REVIEWS)


# --------------------------------------------------------------------------
# Owner fixture
#
# Without this, a fresh database has no account that owns anything, so the
# whole owner dashboard renders its empty state and there is nothing to click.
# This seeds one business owner with two listings - one live, one pending - so
# both status badges, the reviews page and the leads inbox all have real data.
# --------------------------------------------------------------------------

SEED_OWNER = {
    "name": "Nadia Osei",
    "email": "owner@example.ca",
    "role": UserRole.business_owner,
    # The mobile app signs in with a code sent to a phone number, so an owner
    # without one cannot reach their own dashboard there. phone_normalized is
    # the normalised form kept for de-duplicating numbers; the formatted phone
    # is only for display.
    "phone": "+1-604-555-0166",
    "phone_normalized": "16045550166",
}
SEED_OWNER_PASSWORD = "ownerpass123"

# An existing approved listing handed to the seed owner. Chosen because it
# already carries reviews, so the reviews page has something to reply to.
SEED_OWNED_SLUG = "coal-harbour-plumbing"

# A second listing, left pending, so the dashboard shows both states and the
# "not visible until approved" path is visible without editing anything.
SEED_PENDING_LISTING = {
    "slug": "osei-drain-specialists",
    "name": "Osei Drain Specialists",
    "category_slug": "plumbers",
    "city": "Vancouver",
    "address": "250 Powell St",
    "postal_code": "V6A 1G4",
    "latitude": 49.2830,
    "longitude": -123.0980,
    "phone": "+1-604-555-0199",
    "description": "Second location, awaiting review. Drain camera work and root cutting.",
}

# (enquiry_type, message, contact_name, contact_phone) against SEED_OWNED_SLUG.
# The message doubles as the natural key for idempotency, since enquiries have
# no unique constraint of their own.
SEED_ENQUIRIES = [
    (EnquiryType.call_click, None, None, None),
    (EnquiryType.callback, "Kitchen sink backing up, can someone call me this afternoon?",
     "Ruth Adeyemi", "+1-604-555-0311"),
    (EnquiryType.quote, "Need a quote for replacing the main stack in a semi.",
     "Callum Fraser", "+1-778-555-0122"),
]


def seed_owner(db: Session) -> Tuple[User, bool]:
    """Return the seed business owner, creating it if absent."""
    from app.core.security import hash_password

    owner = db.scalar(select(User).where(User.email == SEED_OWNER["email"]))
    if owner is not None:
        # Re-running after a role change should not silently leave a demo
        # owner unable to reach the dashboard.
        if owner.role is not UserRole.business_owner:
            owner.role = UserRole.business_owner
            db.flush()
        # Same for an owner seeded before the phone existed: without it, the
        # mobile app has no way to sign this account in.
        if owner.phone_normalized is None:
            owner.phone = SEED_OWNER["phone"]
            owner.phone_normalized = SEED_OWNER["phone_normalized"]
            db.flush()
        return owner, False

    owner = User(hashed_password=hash_password(SEED_OWNER_PASSWORD), **SEED_OWNER)
    db.add(owner)
    db.flush()
    return owner, True


def seed_ownership(db: Session, owner: User) -> Tuple[int, bool]:
    """Give the seed owner one live listing and one pending one.

    Assigns the live listing only when it has no owner, so a real owner
    claiming it later is never overwritten by a re-run.
    """
    assigned = 0

    live = db.scalar(select(Business).where(Business.slug == SEED_OWNED_SLUG))
    if live is not None and live.owner_id is None:
        live.owner_id = owner.id
        assigned += 1

    spec = SEED_PENDING_LISTING
    pending = db.scalar(select(Business).where(Business.slug == spec["slug"]))
    created = False
    if pending is None:
        category = db.scalar(
            select(Category).where(Category.slug == spec["category_slug"])
        )
        if category is not None:
            db.add(
                Business(
                    slug=spec["slug"],
                    name=spec["name"],
                    category_id=category.id,
                    owner_id=owner.id,
                    city=spec["city"],
                    province="BC",
                    address=spec["address"],
                    postal_code=spec["postal_code"],
                    latitude=spec["latitude"],
                    longitude=spec["longitude"],
                    phone=spec["phone"],
                    description=spec["description"],
                    status=BusinessStatus.pending,
                    is_active=True,
                    verified=False,
                    rating=None,
                    review_count=0,
                )
            )
            created = True
    db.flush()
    return assigned, created


def seed_enquiries(db: Session) -> Tuple[int, int]:
    """Put a few leads against the owner's live listing."""
    business = db.scalar(select(Business).where(Business.slug == SEED_OWNED_SLUG))
    if business is None:
        return 0, len(SEED_ENQUIRIES)

    created = 0
    for enquiry_type, message, name, phone in SEED_ENQUIRIES:
        existing = db.scalar(
            select(Enquiry).where(
                Enquiry.business_id == business.id,
                Enquiry.enquiry_type == enquiry_type,
                # NULL message (a call click) compares by type alone.
                Enquiry.message.is_(None) if message is None
                else Enquiry.message == message,
            )
        )
        if existing is not None:
            continue

        db.add(
            Enquiry(
                business_id=business.id,
                # Anonymous: these model walk-up visitors, not registered users.
                user_id=None,
                enquiry_type=enquiry_type,
                message=message,
                contact_name=name,
                contact_phone=phone,
            )
        )
        created += 1

    db.flush()
    return created, len(SEED_ENQUIRIES)


def seed_verifications(db: Session) -> Tuple[int, int, int]:
    """Mark the seeded catalogue as KYC-verified.

    Necessary, not decorative: search now requires a verified record, so
    without this the whole seeded directory would be invisible and every
    frontend would come up empty against a freshly-migrated database.

    Only listings that are already `approved` are verified. A pending listing
    stays pending on both axes, because the seed's pending listing exists
    precisely to give the moderation queue something to act on - and now the
    KYC queue too.
    """
    businesses = list(db.scalars(select(Business)).all())
    created = 0
    promoted = 0

    for business in businesses:
        existing = db.scalar(
            select(BusinessVerification).where(
                BusinessVerification.business_id == business.id
            )
        )
        if existing is not None:
            # An earlier run may have written this while the listing was still
            # pending; if the listing has since been approved by the fixture,
            # its KYC has to follow or the listing stays invisible - approved
            # but unverified is exactly the state search excludes.
            if (
                business.status is BusinessStatus.approved
                and existing.status is VerificationStatus.pending
                and existing.reviewed_at is None
            ):
                existing.status = VerificationStatus.verified
                existing.reviewed_at = datetime.now(timezone.utc)
                business.verified = True
                promoted += 1
            continue

        is_approved = business.status is BusinessStatus.approved
        db.add(
            BusinessVerification(
                business_id=business.id,
                # The KYC contact is what the owner attested to, so it falls
                # back to something plausible rather than being left blank.
                email=business.email or f"owner@{business.slug}.example.ca",
                mobile_number=business.phone or "+1-604-555-0100",
                license_number=f"BC-{business.id:06d}",
                gst_number=None,
                status=(
                    VerificationStatus.verified
                    if is_approved
                    else VerificationStatus.pending
                ),
                reviewed_at=datetime.now(timezone.utc) if is_approved else None,
            )
        )
        created += 1

    db.flush()
    return created, promoted, len(businesses)
