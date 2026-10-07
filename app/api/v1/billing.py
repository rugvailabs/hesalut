"""Choosing and paying for a plan - only once the business is verified.

    owner  GET  /businesses/{id}/billing                where billing stands
    owner  GET  /businesses/{id}/billing/order?plan_id  what a plan would cost
    owner  POST /businesses/{id}/billing/subscribe      choose a plan, and pay

Registration takes no payment (app/api/v1/registration.py). The order is:
register, submit verification documents, an admin approves them, and only then
can the owner subscribe. Before this, the card was taken first and the business
checked afterwards, so a business that was then refused had already paid.

`require_verified` is the one place that rule lives. The older
POST /subscriptions/checkout calls it too, so there is no second way in.

Payment is still not a visibility gate (app/core/visibility.py): a verified,
approved listing is public whether or not it has a plan. A plan buys ranking.

PAYMENT runs on the test-mode gateway (app/services/payment_gateway.py) until a
real processor is configured.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user, require_owned_business
from app.models.business import Business
from app.models.payment import Payment
from app.models.subscription import BillingCycle, Plan, Subscription, SubscriptionStatus
from app.models.user import User
from app.models.verification import BusinessVerification, VerificationStatus
from app.schemas.billing import BillingState, BillingSubscribe
from app.schemas.registration import OrderSummary, ReceiptOut, TaxLineOut
from app.schemas.subscription import PlanOut, SubscriptionOut
from app.services import payment_gateway, sales_tax
from app.services.mailer import send_email

router = APIRouter(tags=["billing"])


# ------------------------------------------------------------------ the rule


def verification_status(db: Session, business_id: int) -> VerificationStatus | None:
    return db.scalar(
        select(BusinessVerification.status).where(
            BusinessVerification.business_id == business_id
        )
    )


def _blocked_reason(status_: VerificationStatus | None) -> str | None:
    """Why a plan cannot be chosen yet, or None when it can."""
    if status_ is VerificationStatus.verified:
        return None
    if status_ is None:
        return "Verify your business first: submit your documents, and you can choose a plan once they are approved."
    if status_ is VerificationStatus.rejected:
        return "Your verification was not approved. Fix what the reviewer asked for and resubmit, then you can choose a plan."
    return "Your documents are being reviewed. You can choose a plan once your business is verified."


def require_verified(db: Session, business: Business) -> None:
    """409 unless this business has passed verification."""
    reason = _blocked_reason(verification_status(db, business.id))
    if reason is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)


def _current_subscription(db: Session, business_id: int) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(
            Subscription.business_id == business_id,
            Subscription.status.in_((SubscriptionStatus.active, SubscriptionStatus.past_due)),
        )
        .order_by(Subscription.id.desc())
    )


# --------------------------------------------------------------------- money


def build_order(plan: Plan, province: str, now: datetime) -> OrderSummary:
    """The order summary the page shows and the amount charged, from one function."""
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


def _money(amount: Decimal, currency: str) -> str:
    return f"${amount:,.2f} {currency}"


def _percent(rate: Decimal) -> str:
    """Decimal("13") -> "13", Decimal("9.975") -> "9.975"."""
    text = f"{rate:f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _state(db: Session, business: Business) -> BillingState:
    status_ = verification_status(db, business.id)
    subscription = _current_subscription(db, business.id)
    reason = _blocked_reason(status_)
    if reason is None and subscription is not None:
        reason = "This listing already has a plan."

    state = BillingState(
        business_id=business.id,
        verification_status=status_,
        can_subscribe=reason is None,
        blocked_reason=reason,
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


def _send_subscription_email(
    user: User, business: Business, plan: Plan, order: OrderSummary, payment: Payment | None
) -> None:
    """The subscription confirmation - a receipt for paid plans.

    After the commit and best effort: the plan is active whether or not the
    mail server is up.
    """
    settings = get_settings()
    dashboard = f"{settings.web_base_url}/dashboard"

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


def _active_plan(db: Session, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")
    return plan


# ------------------------------------------------------------------- routes


@router.get("/businesses/{business_id}/billing", response_model=BillingState)
def get_billing(
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BillingState:
    """Where this listing's billing stands, and whether a plan can be chosen yet."""
    return _state(db, business)


@router.get("/businesses/{business_id}/billing/order", response_model=OrderSummary)
def get_order(
    plan_id: int = Query(gt=0),
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> OrderSummary:
    """What choosing this plan would cost, taxed for the business's province."""
    require_verified(db, business)
    return build_order(_active_plan(db, plan_id), business.province, datetime.now(timezone.utc))


@router.post("/businesses/{business_id}/billing/subscribe", response_model=BillingState)
def subscribe(
    payload: BillingSubscribe,
    business: Business = Depends(require_owned_business),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingState:
    """Choose a plan and pay for it. Verified businesses only.

    402 with a customer-facing message when the card is declined - nothing is
    created, and the owner can try again. A free plan has nothing to charge and
    activates at once.
    """
    # Serialise on the business row: a double-clicked Pay button waits here,
    # then finds the plan already active.
    business = db.scalar(
        select(Business)
        .where(Business.id == business.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    require_verified(db, business)
    if _current_subscription(db, business.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This listing already has a plan."
        )

    plan = _active_plan(db, payload.plan_id)
    now = datetime.now(timezone.utc)
    order = build_order(plan, business.province, now)
    # The owner pays and gets the receipt; an admin acting for an ownerless
    # listing is the payer of record instead.
    payer = db.get(User, business.owner_id) if business.owner_id else current_user
    actor = f"user:{current_user.id}"

    charge: payment_gateway.StubCharge | None = None
    if order.requires_payment:
        if not (
            payload.card_number
            and payload.exp_month is not None
            and payload.exp_year is not None
            and payload.cvc
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Enter your card details.",
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
                actor=actor,
                action="billing.payment_declined",
                target_table="businesses",
                target_id=business.id,
                # Never the card number: the last four identify the test card.
                metadata={"plan_id": plan.id, "last4": digits[-4:], "reason": str(exc)},
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
            ) from exc
        except payment_gateway.PaymentGatewayError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    subscription = Subscription(
        business_id=business.id,
        plan_id=plan.id,
        status=SubscriptionStatus.active,
        gateway_subscription_id=charge.gateway_subscription_id if charge else None,
        current_period_end=charge.current_period_end if charge else None,
    )
    db.add(subscription)
    db.flush()

    payment: Payment | None = None
    if charge is not None:
        payment = Payment(
            receipt_number=f"JFY-{now:%Y%m%d}-{secrets.token_hex(3).upper()}",
            user_id=payer.id,
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
    db.commit()
    db.refresh(subscription)

    log_audit(
        db,
        actor=actor,
        action="billing.subscribed",
        target_table="subscriptions",
        target_id=subscription.id,
        metadata={
            "business_id": business.id,
            "plan_id": plan.id,
            "receipt": payment.receipt_number if payment else None,
            "total": str(order.total),
        },
    )
    if payment is not None:
        db.refresh(payment)
    _send_subscription_email(payer, business, plan, order, payment)
    return _state(db, business)
