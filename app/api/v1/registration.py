"""Business registration, in three steps.

    1. Details   POST /registration/start      account + business details
                 POST /registration/convert    a signed-in customer's account instead
                 PUT  /registration/details    (going back to edit them)
    2. Confirm   POST /registration/complete   accept the terms; the listing is created
    3. Done      GET  /registration            the state of any step, for resuming

There is no plan and no payment here. A business pays only after it has been
verified: the owner submits their documents from the dashboard, an admin
approves them, and only then can they choose a plan (app/api/v1/billing.py).
Charging first meant taking money from businesses that might be refused.

The account exists from step 1, so an owner who closes the browser signs in
and carries on. It is inactive until step 2 completes: it can do this and
nothing else (require_business_owner refuses it). The business details wait on
the user row, and the listing is created when registration completes - an
abandoned registration never puts a half-finished business in front of
moderators.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1.businesses_owner import _slugify, _unique_slug
from app.core.audit import log_audit
from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.user import User, UserRole
from app.schemas.registration import (
    AccountOut,
    BusinessDetailsIn,
    RegisteredBusiness,
    RegistrationDetailsUpdate,
    RegistrationStart,
    RegistrationStarted,
    RegistrationState,
    TermsAcceptance,
)
from app.services import embeddings
from app.services.mailer import send_email

router = APIRouter(prefix="/registration", tags=["registration"])

#: Details is step 1, the terms are step 2, and 3 is the finished summary.
CONFIRM_STEP = 2
FINAL_STEP = 3

_DETAIL_FIELDS = (
    "business_name",
    "category_id",
    "address",
    "city",
    "province",
    "postal_code",
    "latitude",
    "longitude",
)


# ------------------------------------------------------------------ helpers


def _details_dict(payload: BusinessDetailsIn) -> dict[str, Any]:
    data = payload.model_dump(include=set(_DETAIL_FIELDS))
    # A pin needs both halves.
    if data["latitude"] is None or data["longitude"] is None:
        data["latitude"] = data["longitude"] = None
    return data


def _require_category(db: Session, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Choose a category."
        )


def _registering_owner(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role is not UserRole.business_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business registration is for business accounts.",
        )
    return current_user


def _lock_open_registration(db: Session, user: User) -> User:
    """Re-read the user FOR UPDATE and insist registration is still open.

    The lock is what stops a double-clicked button from completing the same
    registration twice: the second request waits, then finds it done.
    """
    locked = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked is None or locked.is_active or locked.registration_step is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration is already complete.",
        )
    return locked


def _state(db: Session, user: User) -> RegistrationState:
    completed = user.is_active
    details = (
        BusinessDetailsIn(**user.registration_data) if user.registration_data else None
    )

    state = RegistrationState(
        # An account saved at the old plan or payment step resumes at the terms.
        step=FINAL_STEP if completed else min(user.registration_step or CONFIRM_STEP, CONFIRM_STEP),
        completed=completed,
        account=AccountOut(name=user.name, email=user.email, phone=user.phone),
        details=details,
    )

    if completed:
        business = db.scalar(
            select(Business)
            .where(Business.owner_id == user.id)
            .order_by(Business.created_at.desc(), Business.id.desc())
        )
        if business is not None:
            state.business = RegisteredBusiness(
                id=business.id, name=business.name, slug=business.slug, status=business.status.value
            )
    return state


def _complete(db: Session, user: User) -> Business:
    """Create the listing and activate the account.

    No subscription: that comes after verification. The listing is pending
    moderation and has no verification record until the owner submits one.
    """
    now = datetime.now(timezone.utc)
    data = user.registration_data or {}

    business = Business(
        name=data["business_name"],
        category_id=data["category_id"],
        address=data.get("address"),
        city=data["city"],
        province=data["province"],
        postal_code=data.get("postal_code"),
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        # The account's contact details until the owner changes them.
        email=user.email,
        phone=user.phone,
        slug=_unique_slug(db, _slugify(data["business_name"])),
        owner_id=user.id,
        # Registered is not published: moderation and verification still apply.
        status=BusinessStatus.pending,
        is_active=True,
        verified=False,
        rating=None,
        review_count=0,
    )
    db.add(business)
    db.flush()

    user.is_active = True
    user.registration_step = FINAL_STEP
    user.registration_completed_at = now
    db.commit()
    db.refresh(business)

    log_audit(
        db,
        actor=f"user:{user.id}",
        action="registration.completed",
        target_table="users",
        target_id=user.id,
        metadata={"business_id": business.id},
    )
    return business


def _send_welcome_email(user: User, business: Business) -> None:
    """After the commit and best effort: registration has happened whether or
    not the mail server is up."""
    settings = get_settings()
    dashboard = f"{settings.web_base_url}/dashboard"

    send_email(
        to=user.email,
        subject=f"Welcome to justforyou, {user.name}",
        body="\n".join(
            [
                f"Hi {user.name},",
                "",
                f"Thanks for registering {business.name} on justforyou.",
                "",
                "What happens next:",
                "  1. Verify your business - upload your business licence from the dashboard.",
                "  2. Our team reviews your documents. We email you when you are verified.",
                "  3. Choose a plan. You pay only after your business is verified.",
                "  4. Complete your profile: opening hours, a description and a map pin.",
                "",
                f"Your dashboard: {dashboard}",
                "",
                "The justforyou team",
            ]
        ),
    )


# ------------------------------------------------------------------- routes


@router.post(
    "/start", response_model=RegistrationStarted, status_code=status.HTTP_201_CREATED
)
def start_registration(
    payload: RegistrationStart, db: Session = Depends(get_db)
) -> RegistrationStarted:
    """Step 1: create the (inactive) business account and save the details."""
    # Stored as typed, because sign-in matches it exactly; compared without
    # case, because Ann@x.ca and ann@x.ca are the same inbox.
    email = str(payload.email).strip()
    if db.scalar(select(User.id).where(func.lower(User.email) == email.lower())) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists. Sign in to continue your registration.",
        )
    _require_category(db, payload.category_id)

    user = User(
        name=payload.name.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        phone=payload.phone.strip(),
        role=UserRole.business_owner,
        is_active=False,
        registration_step=CONFIRM_STEP,
        registration_data=_details_dict(payload),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_audit(
        db,
        actor=f"user:{user.id}",
        action="registration.started",
        target_table="users",
        target_id=user.id,
    )
    return RegistrationStarted(
        access_token=create_access_token({"sub": str(user.id)}),
        state=_state(db, user),
    )


@router.post("/convert", response_model=RegistrationState)
def convert_customer_account(
    payload: RegistrationDetailsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RegistrationState:
    """Step 1 for someone already signed in as a customer.

    Their account becomes a business account - same email, same password, same
    reviews and enquiries - and goes through the rest of registration exactly
    like a new one: inactive for the dashboard until the terms are accepted and
    the registration completes. Asking them to sign out and open a second
    account under another email would be the only alternative, and a worse one.
    """
    if current_user.is_admin or current_user.role is UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff accounts cannot register a business. Use a separate account.",
        )
    if current_user.role is UserRole.business_owner:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This is already a business account.",
        )
    _require_category(db, payload.category_id)

    user = db.scalar(
        select(User)
        .where(User.id == current_user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    user.role = UserRole.business_owner
    user.is_active = False
    user.registration_step = CONFIRM_STEP
    user.registration_data = _details_dict(payload)
    user.name = payload.name.strip()
    user.phone = payload.phone.strip()
    db.commit()
    db.refresh(user)

    log_audit(
        db,
        actor=f"user:{user.id}",
        action="registration.started",
        target_table="users",
        target_id=user.id,
        metadata={"converted_from": "customer"},
    )
    return _state(db, user)


@router.get("", response_model=RegistrationState)
def get_registration(
    user: User = Depends(_registering_owner), db: Session = Depends(get_db)
) -> RegistrationState:
    """Where the owner has got to - the page resumes from this."""
    return _state(db, user)


@router.put("/details", response_model=RegistrationState)
def update_details(
    payload: RegistrationDetailsUpdate,
    user: User = Depends(_registering_owner),
    db: Session = Depends(get_db),
) -> RegistrationState:
    """Step 1 again: change the details."""
    user = _lock_open_registration(db, user)
    _require_category(db, payload.category_id)
    user.name = payload.name.strip()
    user.phone = payload.phone.strip()
    user.registration_data = _details_dict(payload)
    db.commit()
    db.refresh(user)
    return _state(db, user)


@router.post("/complete", response_model=RegistrationState)
def complete_registration(
    payload: TermsAcceptance,
    background: BackgroundTasks,
    user: User = Depends(_registering_owner),
    db: Session = Depends(get_db),
) -> RegistrationState:
    """Step 2: accept the terms. Creates the listing and activates the account.

    Nothing is charged. The owner verifies their business next, and chooses a
    plan once that is approved.
    """
    user = _lock_open_registration(db, user)
    if not user.registration_data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enter your business details before continuing.",
        )

    business = _complete(db, user)
    _send_welcome_email(user, business)
    # Keep the listing findable by meaning (smart search layer 2); a no-op
    # when semantic search is off.
    background.add_task(
        embeddings.sync_in_background, sessionmaker(bind=db.get_bind(), future=True), business.id
    )
    return _state(db, user)
