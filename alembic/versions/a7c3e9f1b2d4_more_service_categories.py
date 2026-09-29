"""more service categories: 44 common local services

The directory launched with 12 categories. These are the services people most
often look up in a Canadian city, grouped here by theme only for readability -
the taxonomy stays flat (parent_id NULL), which is what every screen shows.

Data only. Idempotent (ON CONFLICT on the unique slug), so it is safe on a
database where some of these were added by hand. The downgrade removes only
categories that no listing uses, so it never orphans a business.

English names only: the web app shows French names from a slug-keyed map
(web/lib/categories.ts).

Revision ID: a7c3e9f1b2d4
Revises: e5a1c7d3f9b2
Create Date: 2026-09-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3e9f1b2d4'
down_revision: Union[str, None] = 'e5a1c7d3f9b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (slug, name, icon emoji, description). sort_order follows list order, after
# the original 12 (which run 10..120).
CATEGORIES = [
    # --- home services -----------------------------------------------------
    ("hvac", "Heating & Cooling", "🌡️", "Furnaces, heat pumps, air conditioning and duct cleaning."),
    ("roofing", "Roofing", "🏠", "Roof repair and replacement, gutters and skylights."),
    ("cleaning", "Cleaning Services", "🧽", "House, office, move-out and carpet cleaning."),
    ("pest-control", "Pest Control", "🐜", "Rodents, insects and wildlife removal."),
    ("painters", "Painters", "🎨", "Interior and exterior painting and drywall touch-ups."),
    ("landscaping", "Landscaping & Gardening", "🌿", "Lawn care, garden design, tree and hedge work."),
    ("locksmiths", "Locksmiths", "🔑", "Lockouts, rekeying, locks and safes."),
    ("handyman", "Handyman Services", "🛠️", "Small repairs, assembly, mounting and odd jobs."),
    ("appliance-repair", "Appliance Repair", "🧺", "Washers, dryers, fridges, ovens and dishwashers."),
    ("renovation", "Renovation & Contractors", "🏗️", "Kitchens, bathrooms, basements and additions."),
    ("flooring", "Flooring", "🪵", "Hardwood, laminate, tile and carpet installation."),
    ("windows-doors", "Windows & Doors", "🚪", "Window and door replacement, glass repair."),
    # --- health & wellness -------------------------------------------------
    ("walk-in-clinics", "Doctors & Walk-in Clinics", "🩺", "Family doctors and walk-in medical clinics."),
    ("pharmacies", "Pharmacies", "💊", "Prescriptions, vaccinations and health products."),
    ("physiotherapy", "Physiotherapy", "🦵", "Injury rehab, sports physio and mobility care."),
    ("chiropractors", "Chiropractors", "🦴", "Back, neck and joint care."),
    ("optometrists", "Optometrists", "👓", "Eye exams, glasses and contact lenses."),
    ("massage-therapy", "Massage Therapy (RMT)", "💆", "Registered massage therapists."),
    ("counselling", "Counselling & Mental Health", "💬", "Counsellors, psychologists and therapists."),
    ("veterinarians", "Veterinarians", "🐾", "Animal hospitals and vet clinics."),
    # --- food --------------------------------------------------------------
    ("cafes-bakeries", "Cafés & Bakeries", "☕", "Coffee shops, bakeries and patisseries."),
    ("grocery", "Grocery Stores", "🛒", "Supermarkets, international and specialty grocers."),
    ("caterers", "Caterers", "🍱", "Catering for events, offices and weddings."),
    # --- automotive --------------------------------------------------------
    ("car-wash", "Car Wash & Detailing", "🚿", "Car washes, detailing and ceramic coating."),
    ("towing", "Towing", "🛻", "Towing and roadside assistance."),
    ("driving-schools", "Driving Schools", "🚦", "Driving lessons and road test preparation."),
    # --- education & family ------------------------------------------------
    ("tutoring", "Tutoring", "📚", "Tutoring for school subjects and exams."),
    ("childcare", "Daycare & Childcare", "🧸", "Daycares, preschools and before- and after-school care."),
    ("music-lessons", "Music Lessons", "🎹", "Piano, guitar, voice and other lessons."),
    # --- professional services ---------------------------------------------
    ("accountants", "Accountants & Tax", "🧮", "Bookkeeping, tax returns and small-business accounting."),
    ("real-estate", "Real Estate Agents", "🏡", "Buying, selling and renting homes."),
    ("insurance", "Insurance Brokers", "🛡️", "Home, auto, business and life insurance."),
    ("immigration", "Immigration Consultants", "🛂", "Licensed immigration consultants (RCIC) for visas and permits."),
    ("notaries", "Notaries", "✒️", "Wills, property transfers and document signing."),
    ("translators", "Translation Services", "🌐", "Certified translation and interpreting."),
    ("photographers", "Photographers", "📷", "Portrait, wedding, event and product photography."),
    ("event-planners", "Event Planners", "🎉", "Weddings, parties and corporate events."),
    ("print-copy", "Print & Copy", "🖨️", "Printing, copying, signs and business cards."),
    # --- personal & pets ---------------------------------------------------
    ("barbers", "Barbers", "💈", "Haircuts, fades and beard trims."),
    ("tailors", "Tailors & Alterations", "🧵", "Alterations, repairs and custom tailoring."),
    ("dry-cleaners", "Dry Cleaners", "👔", "Dry cleaning, laundry and pressing."),
    ("pet-grooming", "Pet Grooming", "🐩", "Grooming, bathing and nail trims for pets."),
    ("device-repair", "Phone & Computer Repair", "📱", "Screen, battery and laptop repair."),
    ("bike-shops", "Bike Shops", "🚲", "Bike sales, repairs and tune-ups."),
]

FIRST_SORT_ORDER = 130


def upgrade() -> None:
    conn = op.get_bind()
    for i, (slug, name, icon, description) in enumerate(CATEGORIES):
        conn.execute(
            sa.text(
                "INSERT INTO categories (slug, name, icon, description, sort_order) "
                "VALUES (:slug, :name, :icon, :description, :sort_order) "
                "ON CONFLICT (slug) DO NOTHING"
            ),
            {
                "slug": slug,
                "name": name,
                "icon": icon,
                "description": description,
                "sort_order": FIRST_SORT_ORDER + i * 10,
            },
        )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "DELETE FROM categories c WHERE c.slug = ANY(:slugs) "
            "AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.category_id = c.id)"
        ),
        {"slugs": [slug for slug, *_ in CATEGORIES]},
    )
