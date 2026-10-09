"""Idempotent development seed data for hesalut.

Run from the project root (or inside the backend container):

    python -m scripts.seed
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password
from scripts.seed_directory import (
    SEED_OWNER,
    SEED_OWNER_PASSWORD,
    seed_businesses,
    seed_categories,
    seed_enquiries,
    seed_ownership,
    seed_owner,
    seed_reviews,
    seed_verifications,
)
from scripts.seed_booking import seed_booking
from app.services import storage
from app.models import (
    Consent,
    ConsentType,
    PreferredContactMethod,
    Provider,
    Submission,
    SubmissionStatus,
    User,
)

POLICY_VERSION = "2026-01-v1"

# Dev-only credentials for the seeded account.
SEED_PASSWORD = "seedpassword123"

# Natural key for the placeholder submission the pipeline is triggered against.
SEED_VIDEO_PATH = "seed/placeholder.mp4"

SEED_USER = {
    "name": "Marc Tremblay",
    "email": "marc.tremblay@example.ca",
    "phone": "+1-416-555-0142",
    "preferred_contact_method": PreferredContactMethod.email,
}

SEED_PROVIDERS = [
    {
        "name": "Maple Leaf Plumbing Co.",
        "category": "plumbing",
        "region": "Ontario",
        "contact_email": "dispatch@mapleleafplumbing.ca",
        "contact_phone": "+1-416-555-0188",
    },
    {
        "name": "Rideau Drain & Pipe",
        "category": "plumbing",
        "region": "Ontario",
        "contact_email": "hello@rideaudrain.ca",
        "contact_phone": "+1-613-555-0119",
    },
    {
        "name": "Beaudoin Legal Services",
        "category": "legal",
        "region": "Quebec",
        "contact_email": "contact@beaudoinlegal.ca",
        "contact_phone": "+1-514-555-0173",
    },
    {
        "name": "Cabinet Juridique Laurentides",
        "category": "legal",
        "region": "Quebec",
        "contact_email": "info@cjlaurentides.ca",
        "contact_phone": None,
    },
    {
        "name": "GTA Mobile Repair Centre",
        "category": "mobile repair",
        "region": "Ontario",
        "contact_email": "service@gtamobilerepair.ca",
        "contact_phone": "+1-416-555-0311",
    },
    {
        "name": "Reparation Mobile Montreal",
        "category": "mobile repair",
        "region": "Quebec",
        "contact_email": "info@reparationmobile.ca",
        "contact_phone": "+1-514-555-0244",
    },
    {
        "name": "Northern Bytes IT Support",
        "category": "it support",
        "region": "Ontario",
        "contact_email": "support@northernbytes.ca",
        "contact_phone": "+1-289-555-0164",
    },
]


def seed_user(db: Session) -> Tuple[User, bool]:
    """Return the seed user, creating it only if the email is not taken."""
    user = db.scalar(select(User).where(User.email == SEED_USER["email"]))
    if user is not None:
        # The add-hashed_password migration backfills pre-existing rows with the
        # unusable marker '!'. Give the dev account a real password so it can
        # actually log in, without touching one that has already been set.
        if user.hashed_password == "!":
            user.hashed_password = hash_password(SEED_PASSWORD)
            db.flush()
        return user, False

    user = User(hashed_password=hash_password(SEED_PASSWORD), **SEED_USER)
    db.add(user)
    db.flush()  # assign user.id without ending the transaction
    return user, True


def seed_consent(db: Session, user: User) -> Tuple[Consent, bool]:
    """Return the user's active send_email consent, creating it if absent."""
    consent = db.scalar(
        select(Consent).where(
            Consent.user_id == user.id,
            Consent.consent_type == ConsentType.send_email,
            Consent.revoked_at.is_(None),
        )
    )
    if consent is not None:
        return consent, False

    consent = Consent(
        user_id=user.id,
        consent_type=ConsentType.send_email,
        policy_version=POLICY_VERSION,
        granted_at=datetime.now(timezone.utc),
        revoked_at=None,
        ip_address="198.51.100.24",
        method="checkbox",
    )
    db.add(consent)
    db.flush()
    return consent, True


def seed_submission(db: Session, user: User) -> Tuple[Submission, bool]:
    """Return a placeholder submission in UPLOADED, creating it if absent.

    Phase 1.4 needs a real submissions row to run the Celery chain against;
    video_path acts as the natural key so re-running stays idempotent.
    """
    submission = db.scalar(
        select(Submission).where(Submission.video_path == SEED_VIDEO_PATH)
    )
    if submission is not None:
        return submission, False

    submission = Submission(
        user_id=user.id,
        video_path=SEED_VIDEO_PATH,
        status=SubmissionStatus.UPLOADED,
    )
    db.add(submission)
    db.flush()
    return submission, True


def ensure_seed_video_object() -> bool:
    """Put a real object behind SEED_VIDEO_PATH.

    Since Phase 3.5 the transcription service actually fetches the file from
    storage, so a seeded submission pointing at a key that does not exist would
    fail the pipeline. Idempotent: only writes if the object is missing.
    """
    try:
        if storage.video_exists(SEED_VIDEO_PATH):
            return False
        # Minimal ISO-BMFF header so the bytes are a plausible MP4.
        payload = bytes([0, 0, 0, 0x1C]) + b"ftypisom" + bytes(8) + bytes(4096)
        storage.upload_video(payload, SEED_VIDEO_PATH, content_type="video/mp4")
        return True
    except storage.StorageError as exc:
        print(f"  WARNING: could not seed the video object: {exc}")
        return False


def seed_providers(db: Session) -> Tuple[List[Provider], int]:
    """Create any missing providers, matching on name."""
    providers: List[Provider] = []
    created = 0
    for spec in SEED_PROVIDERS:
        provider = db.scalar(select(Provider).where(Provider.name == spec["name"]))
        if provider is None:
            provider = Provider(verified=True, **spec)
            db.add(provider)
            created += 1
        providers.append(provider)
    db.flush()
    return providers, created


def main() -> int:
    db = SessionLocal()
    try:
        user, user_created = seed_user(db)
        consent, consent_created = seed_consent(db, user)
        submission, submission_created = seed_submission(db, user)
        video_created = ensure_seed_video_object()
        _providers, providers_created = seed_providers(db)
        # Public directory: categories must exist before listings reference them.
        categories_created, categories_total = seed_categories(db)
        businesses_created, businesses_total = seed_businesses(db)
        reviews_created, reviews_total = seed_reviews(db)
        # Ownership last: it needs both the listings and the owner to exist.
        owner, owner_created = seed_owner(db)
        assigned, pending_created = seed_ownership(db, owner)
        enquiries_created, enquiries_total = seed_enquiries(db)
        # Verification last of the directory work: it reads every listing's
        # status, including the pending one seed_ownership just created.
        (
            verifications_created,
            verifications_promoted,
            verifications_total,
        ) = seed_verifications(db)
        # Booking last: it needs the listings, and only touches demo ones.
        booking_services, booking_switched, booking_total = seed_booking(db)
        db.commit()
        # commit() expires attributes and close() detaches the instances, so
        # read everything the summary needs while the session is still open.
        summary = {
            "user": f"{user.name} <{user.email}> (id={user.id})",
            "consent": (
                f"{consent.consent_type.value} "
                f"(id={consent.id}, policy={consent.policy_version})"
            ),
            "submission": (
                f"id={submission.id}, status={submission.status.value}, "
                f"video_path={submission.video_path}"
            ),
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    def tag(created: bool) -> str:
        return "created" if created else "already present"

    categories = sorted({p["category"] for p in SEED_PROVIDERS})
    regions = sorted({p["region"] for p in SEED_PROVIDERS})

    print("Seed summary")
    print("------------")
    print(f"  User     : {summary['user']} - {tag(user_created)}")
    print(f"             password: {SEED_PASSWORD} (dev only)")
    print(f"  Consent  : {summary['consent']} - {tag(consent_created)}")
    print(f"  Submission: {summary['submission']} - {tag(submission_created)}")
    print(f"             storage object: {SEED_VIDEO_PATH} - {tag(video_created)}")
    print(
        f"  Providers: {providers_created} created, "
        f"{len(SEED_PROVIDERS) - providers_created} already present "
        f"({len(SEED_PROVIDERS)} total)"
    )
    print(f"             categories: {', '.join(categories)}")
    print(f"             regions   : {', '.join(regions)}")
    print(
        f"  Directory: {categories_created} categories created, "
        f"{categories_total - categories_created} already present "
        f"({categories_total} total)"
    )
    print(
        f"             {businesses_created} businesses created, "
        f"{businesses_total - businesses_created} already present "
        f"({businesses_total} total)"
    )
    print(
        f"             {reviews_created} reviews created, "
        f"{reviews_total - reviews_created} already present "
        f"({reviews_total} total)"
    )
    print(
        f"  Owner    : {SEED_OWNER['name']} <{SEED_OWNER['email']}> - "
        f"{tag(owner_created)}"
    )
    print(f"             password: {SEED_OWNER_PASSWORD} (dev only)")
    print(
        f"             {assigned} existing listing assigned, "
        f"{1 if pending_created else 0} pending listing created"
    )
    print(
        f"             {enquiries_created} enquiries created, "
        f"{enquiries_total - enquiries_created} already present "
        f"({enquiries_total} total)"
    )
    print(
        f"  KYC      : {verifications_created} verification records created, "
        f"{verifications_promoted} promoted to verified, "
        f"{verifications_total} listings total"
    )
    print("             approved listings are marked verified so search sees them")
    print(
        f"  Booking  : {booking_services} services created, "
        f"{booking_switched} listings switched to booking requests "
        f"({booking_total} bookable demo listings)"
    )
    print("  Plans    : managed by migrations (alembic upgrade head), not seeded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
