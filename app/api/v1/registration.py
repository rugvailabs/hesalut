"""Business registration, in four steps.

    1. Details   POST /registration/start      account + business details
                 POST /registration/convert    a signed-in customer's account instead
                 PUT  /registration/details    (going back to edit them)
    2. Plan      PUT  /registration/plan       saved the moment "Select" is clicked
    3. Payment   POST /registration/payment    paid plans
                 POST /registration/complete   the free plan, which has nothing to pay
    4. Done      GET  /registration            the state of any step, for resuming

The account exists from step 1, so an owner who closes the browser signs in
and carries on. It is inactive until step 4: it can do this and nothing else
(require_business_owner refuses it). The business details wait on the user row,
and the listing, the subscription and the receipt are created together when
registration completes - an abandoned registration never puts a half-finished
business in front of moderators or a paid-for plan without a listing.

Money is computed here, never taken from the client: the order summary the
page shows and the amount charged come from the same function.

PAYMENT runs on the test-mode gateway (app/services/payment_gateway.py) until a
real processor is configured; with one configured this step refuses rather
than pretending, until its hosted checkout is wired in.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal
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
from app.models.payment import Payment
from app.models.subscription import BillingCycle, Plan, Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.schemas.registration import (
    AccountOut,
    BusinessDetailsIn,
    OrderSummary,
    PlanChoice,
    ReceiptOut,
    RegisteredBusiness,
    RegistrationDetailsUpdate,
    RegistrationPayment,
    RegistrationStart,
    RegistrationStarted,
    RegistrationState,
    TaxLineOut,
    TermsAcceptance,
)
from app.schemas.subscription import PlanOut, SubscriptionOut
from app.services import embeddings, payment_gateway, sales_tax
from app.services.mailer import send_email

router = APIRouter(prefix="/registration", tags=["registration"])

FINAL_STEP = 4

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

    The lock is what stops a double-clicked Pay button from completing the
    same registration twice: the second request waits, then finds it done.
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


def _order(plan: Plan, province: str, now: datetime) -> OrderSummary:
    taxed = sales_tax.calculate(plan.amount, province)
    requires_payment = plan.amount > Decimal("0")
    months = 12 if plan.billing_cycle is BillingCycle.yearly else 1
    return OrderSummary(
        plan=PlanOut.model_validate(plan),
        currency=plan.currency,
        subtotal=taxed.subtotal,
        tax_lines=[TaxLineOut(name=l.name, rate=l.rate, amount=l.amount) for l in taxed.lines],
        tax_total=taxed.tax_total,
        total=taxed.total,
        province=taxed.province,
        requires_payment=requires_payment,
        period_label=("12 months" if months == 12 else "1 month") if requires_payment else None,
        renews_on=payment_gateway.add_months(now, months) if requires_payment else None,
        uncollected_taxes=[
            f"{tax.name} ({tax.rate}%)"
            for tax in sales_tax.RATES[taxed.province]
            if not tax.collected
        ],
    )


def _state(db: Session, user: User) -> RegistrationState:
    now = datetime.now(timezone.utc)
    completed = user.is_active
    details = (
        BusinessDetailsIn(**user.registration_data) if user.registration_data else None
    )
    plan = db.get(Plan, user.selected_plan_id) if user.selected_plan_id else None

    state = RegistrationState(
        step=FINAL_STEP if completed else (user.registration_step or 2),
        completed=completed,
        account=AccountOut(name=user.name, email=user.email, phone=user.phone),
        details=details,
        selected_plan=PlanOut.model_validate(plan) if plan is not None else None,
        order=(
            _order(plan, details.province, now)
            if plan is not None and details is not None and not completed
            else None
        ),
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
            subscription = db.scalar(
                select(Subscription)
                .where(Subscription.business_id == business.id)
                .order_by(Subscription.id.desc())
            )
            if subscription is not None:
                state.subscription = SubscriptionOut.model_validate(subscription)
                payment = db.scalar(
                    select(Payment)
                    .where(Payment.subscription_id == subscription.id)
                    .order_by(Payment.id.desc())
                )
                if payment is not None:
                    state.receipt = _receipt(payment)
    return state


def _receipt(payment: Payment) -> ReceiptOut:
    return ReceiptOut(
        receipt_number=payment.receipt_number,
        created_at=payment.created_at,
        currency=payment.currency,
        subtotal=payment.subtotal,
        tax_lines=[TaxLineOut(**line) for line in payment.tax_lines],
        tax_total=payment.tax_total,
        total=payment.total,
        province=payment.province,
        card_brand=payment.card_brand,
        card_last4=payment.card_last4,
        gateway=payment.gateway,
        gst_hst_registration_number=get_settings().gst_hst_registration_number or None,
    )


def _complete(
    db: Session,
    user: User,
    plan: Plan,
    order: OrderSummary,
    charge: payment_gateway.StubCharge | None,
) -> tuple[Business, Subscription, Payment | None]:
    """Create the listing, the subscription and the receipt; activate the account.

    One transaction: either the owner ends up registered with all three, or
    with none of them and can try again.
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

    subscription = Subscription(
        business_id=business.id,
        plan_id=plan.id,
        status=SubscriptionStatus.active,
        gateway_subscription_id=charge.gateway_subscription_id if charge else None,
        current_period_end=charge.current_period_end if charge else None,
    )
    db.add(subscription)
    db.flush()

    payment = None
    if charge is not None:
        payment = Payment(
            receipt_number=f"JFY-{now:%Y%m%d}-{secrets.token_hex(3).upper()}",
            user_id=user.id,
            plan_id=plan.id,
            subscription_id=subscription.id,
            currency=order.currency,
            subtotal=order.subtotal,
            tax_total=order.tax_total,
            total=order.total,
            tax_lines=[
                {"name": l.name, "rate": str(l.rate), "amount": str(l.amount)}
                for l in order.tax_lines
            ],
            province=order.province,
            gateway="stub",
            gateway_payment_id=charge.payment_id,
            card_brand=charge.brand,
            card_last4=charge.last4,
            terms_accepted_at=now,
        )
        db.add(payment)

    user.is_active = True
    user.registration_step = FINAL_STEP
    user.registration_completed_at = now
    db.commit()
    db.refresh(business)
    db.refresh(subscription)
    if payment is not None:
        db.refresh(payment)

    log_audit(
        db,
        actor=f"user:{user.id}",
        action="registration.completed",
        target_table="users",
        target_id=user.id,
        metadata={
            "business_id": business.id,
            "subscription_id": subscription.id,
            "plan_id": plan.id,
            "receipt": payment.receipt_number if payment else None,
            "total": str(order.total),
        },
    )
    return business, subscription, payment


def _money(amount: Decimal, currency: str) -> str:
    return f"${amount:,.2f} {currency}"


def _percent(rate: Decimal) -> str:
    """Decimal("13") -> "13", Decimal("9.975") -> "9.975"."""
    text = f"{rate:f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _send_completion_emails(
    user: User, business: Business, plan: Plan, order: OrderSummary, payment: Payment | None
) -> None:
    """Welcome, then the subscription confirmation (a receipt for paid plans).

    After the commit and best effort: registration has happened whether or
    not the mail server is up.
    """
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
                "Before your listing appears in search:",
                "  1. Verify your business - upload your business licence from the dashboard.",
                "  2. Our team reviews the listing's details.",
                "  3. Complete your profile: opening hours, a description and a map pin.",
                "",
                f"Your dashboard: {dashboard}",
                "",
                "The justforyou team",
            ]
        ),
    )

    if payment is None:
        lines = [
            f"Hi {user.name},",
            "",
            f"Your {plan.name} plan for {business.name} is active.",
            "It is free: there is nothing to pay and no card on file.",
            "",
            f"Your dashboard: {dashboard}",
        ]
        subject = f"Your {plan.name} plan is active"
    else:
        cycle = "year" if plan.billing_cycle is BillingCycle.yearly else "month"
        lines = [
            f"Hi {user.name},",
            "",
            f"Your {plan.name} plan for {business.name} is active. Here is your receipt.",
            "",
            f"Receipt:        {payment.receipt_number}",
            f"Date:           {payment.created_at:%Y-%m-%d}",
            f"Plan:           {plan.name} ({order.period_label})",
            f"Subtotal:       {_money(payment.subtotal, payment.currency)}",
        ]
        for line in order.tax_lines:
            lines.append(
                f"{line.name} ({_percent(line.rate)}%):".ljust(16)
                + f"{_money(line.amount, payment.currency)}"
            )
        lines += [
            f"Total paid:     {_money(payment.total, payment.currency)}",
            f"Paid with:      {payment.card_brand} ending {payment.card_last4}",
            f"Tax province:   {payment.province}",
        ]
        if settings.gst_hst_registration_number:
            lines.append(f"GST/HST no.:    {settings.gst_hst_registration_number}")
        if order.renews_on is not None:
            lines += [
                "",
                f"Your plan renews automatically on {order.renews_on:%B %-d, %Y} "
                f"and every {cycle} after that, at the price then in effect plus "
                "applicable taxes, until you cancel.",
                f"To cancel, contact us: {settings.web_base_url}/contact",
            ]
        lines += ["", "TEST MODE: no real payment was taken."] if payment.gateway == "stub" else []
        subject = f"Receipt {payment.receipt_number} - {plan.name} plan"

    send_email(to=user.email, subject=subject, body="\n".join(lines + ["", "The justforyou team"]))


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
        registration_step=2,
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
    like a new one: inactive for the dashboard until a plan is chosen and the
    registration completes. Asking them to sign out and open a second account
    under another email would be the only alternative, and a worse one.
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
    user.registration_step = 2
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
    """Step 1 again: change the details without losing the chosen plan."""
    user = _lock_open_registration(db, user)
    _require_category(db, payload.category_id)
    user.name = payload.name.strip()
    user.phone = payload.phone.strip()
    user.registration_data = _details_dict(payload)
    db.commit()
    db.refresh(user)
    return _state(db, user)


@router.put("/plan", response_model=RegistrationState)
def choose_plan(
    payload: PlanChoice,
    user: User = Depends(_registering_owner),
    db: Session = Depends(get_db),
) -> RegistrationState:
    """Step 2: save the chosen plan. Choosing again replaces it."""
    user = _lock_open_registration(db, user)
    plan = db.get(Plan, payload.plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")

    user.selected_plan_id = plan.id
    user.registration_step = max(user.registration_step or 2, 3)
    db.commit()
    db.refresh(user)

    log_audit(
        db,
        actor=f"user:{user.id}",
        action="registration.plan_selected",
        target_table="users",
        target_id=user.id,
        metadata={"plan_id": plan.id},
    )
    return _state(db, user)


def _selected_plan(db: Session, user: User) -> tuple[Plan, OrderSummary]:
    plan = db.get(Plan, user.selected_plan_id) if user.selected_plan_id else None
    if plan is None or not plan.is_active or not user.registration_data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Choose a plan before continuing.",
        )
    province = user.registration_data["province"]
    return plan, _order(plan, province, datetime.now(timezone.utc))


@router.post("/payment", response_model=RegistrationState)
def pay_and_complete(
    payload: RegistrationPayment,
    background: BackgroundTasks,
    user: User = Depends(_registering_owner),
    db: Session = Depends(get_db),
) -> RegistrationState:
    """Step 3: take payment for the chosen plan, then complete registration.

    402 with a customer-facing message when the card is declined - nothing is
    created, and the owner can try again.
    """
    user = _lock_open_registration(db, user)
    plan, order = _selected_plan(db, user)
    if not order.requires_payment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{plan.name} is free - there is nothing to pay.",
        )

    try:
        charge = payment_gateway.charge_stub_card(
            card_number=payload.card_number,
            exp_month=payload.exp_month,
            exp_year=payload.exp_year,
            cvc=payload.cvc,
            billing_cycle=plan.billing_cycle.value,
        )
    except payment_gateway.PaymentDeclined as exc:
        db.rollback()  # release the row lock before the audit write
        digits = "".join(ch for ch in payload.card_number if ch.isdigit())
        log_audit(
            db,
            actor=f"user:{user.id}",
            action="registration.payment_declined",
            target_table="users",
            target_id=user.id,
            # Never the card number: the last four identify the test card.
            metadata={"plan_id": plan.id, "last4": digits[-4:], "reason": str(exc)},
        )
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
    except payment_gateway.PaymentGatewayError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    business, _subscription, payment = _complete(db, user, plan, order, charge)
    _send_completion_emails(user, business, plan, order, payment)
    # Keep the listing findable by meaning (smart search layer 2); a no-op
    # when semantic search is off.
    background.add_task(
        embeddings.sync_in_background, sessionmaker(bind=db.get_bind(), future=True), business.id
    )
    return _state(db, user)


@router.post("/complete", response_model=RegistrationState)
def complete_free(
    payload: TermsAcceptance,
    background: BackgroundTasks,
    user: User = Depends(_registering_owner),
    db: Session = Depends(get_db),
) -> RegistrationState:
    """Steps 3-4 for a free plan: nothing to pay, so complete straight away."""
    user = _lock_open_registration(db, user)
    plan, order = _selected_plan(db, user)
    if order.requires_payment:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"The {plan.name} plan needs payment to complete registration.",
        )

    business, _subscription, _payment = _complete(db, user, plan, order, None)
    _send_completion_emails(user, business, plan, order, None)
    # Keep the listing findable by meaning (smart search layer 2); a no-op
    # when semantic search is off.
    background.add_task(
        embeddings.sync_in_background, sessionmaker(bind=db.get_bind(), future=True), business.id
    )
    return _state(db, user)
