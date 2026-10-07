"""Plans, checkout and subscription state.

Paying affects ORDER in search, never VISIBILITY: a business with no plan is
still found, below the Featured (Annual), Promoted (Monthly) and Basic tiers,
and every paid position is labelled on the result card. Visibility is still
decided by moderation and verification alone. See app/services/placement.py.

The endpoints are real and work today. With no STRIPE_SECRET_KEY configured
they run in stub mode: subscription rows are created and move through their
states, the checkout URL is a placeholder, and no money moves. See
app/services/payment_gateway.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import log_audit
from app.core.config import get_settings
from app.core.db import get_db
from app.api.v1.billing import require_verified
from app.core.deps import require_business_owner, require_owned_business
from app.models.business import Business
from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.schemas.subscription import (
    CheckoutRequest,
    CheckoutSessionOut,
    PaymentConfigOut,
    PlanOut,
    StubPaymentRequest,
    SubscriptionOut,
    WebhookAck,
)
from app.services import payment_gateway

router = APIRouter(tags=["payments"])

# Stripe's subscription statuses, mapped onto the four this app models.
# `trialing` counts as active: the customer has access. `unpaid` and
# `incomplete_expired` are terminal failures and read as canceled.
_STATUS_FROM_GATEWAY: dict[str, SubscriptionStatus] = {
    "active": SubscriptionStatus.active,
    "trialing": SubscriptionStatus.active,
    "past_due": SubscriptionStatus.past_due,
    "canceled": SubscriptionStatus.canceled,
    "unpaid": SubscriptionStatus.canceled,
    "incomplete": SubscriptionStatus.incomplete,
    "incomplete_expired": SubscriptionStatus.canceled,
}


def _period_end(value: object) -> datetime | None:
    """Stripe sends period ends as unix seconds; keep them tz-aware."""
    if isinstance(value, (int, float)) and value > 0:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    return None


def _retire_abandoned_checkouts(db: Session, business_id: int, keep_id: int) -> None:
    """Cancel the listing's other unfinished checkouts once one plan is active.

    Choosing Standard, going back and choosing Basic leaves an `incomplete`
    Standard row behind; left alone it would sit there looking payable.
    """
    for stale in db.scalars(
        select(Subscription).where(
            Subscription.business_id == business_id,
            Subscription.status == SubscriptionStatus.incomplete,
            Subscription.id != keep_id,
        )
    ):
        stale.status = SubscriptionStatus.canceled
        stale.canceled_at = datetime.now(timezone.utc)


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)) -> list[Plan]:
    """The plans on offer. Public: pricing is not a secret.

    Retired plans are hidden here but still readable through an existing
    subscription, because last year's price is part of that record.
    """
    return list(
        db.scalars(
            select(Plan)
            .where(Plan.is_active.is_(True))
            .order_by(Plan.sort_order.asc(), Plan.amount.asc(), Plan.id.asc())
        ).all()
    )


@router.get("/payments/config", response_model=PaymentConfigOut)
def payment_config() -> PaymentConfigOut:
    """Which way payment is taken, so a client can render the right step.

    Public, like pricing: it reveals only whether a gateway is configured and
    the publishable key, which exists to be given to browsers.
    """
    if payment_gateway.gateway_configured():
        return PaymentConfigOut(
            mode="stripe", publishable_key=payment_gateway.publishable_key()
        )
    return PaymentConfigOut(mode="stub")


@router.post("/subscriptions/checkout", response_model=CheckoutSessionOut)
def start_checkout(
    payload: CheckoutRequest,
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> CheckoutSessionOut:
    """Begin a subscription for one of the caller's listings.

    The ownership check is done here rather than through require_owned_business
    because the business id arrives in the body, not the path - but the rules
    are the same ones: 404 for a listing that does not exist, 403 for one
    belonging to somebody else.

    The row is created `incomplete` and only a webhook can make it active. A
    client that reaches the success URL has proved nothing: it can be opened
    directly, which is why the return URL is a navigation and the webhook is
    the source of truth.
    """
    business = db.get(Business, payload.business_id)
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found"
        )
    is_admin = current_user.is_admin or current_user.role is UserRole.admin
    if business.owner_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this listing",
        )

    # Pay only after verification - the same rule as /businesses/{id}/billing.
    require_verified(db, business)

    plan = db.get(Plan, payload.plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )

    existing = db.scalar(
        select(Subscription)
        .where(
            Subscription.business_id == business.id,
            Subscription.status.in_(
                (SubscriptionStatus.active, SubscriptionStatus.past_due)
            ),
        )
        .order_by(Subscription.id.desc())
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This listing already has a subscription. Cancel it before "
                "starting another."
            ),
        )

    settings = get_settings()

    # A free plan has nothing to collect, so it never reaches the gateway: the
    # subscription is active the moment it is chosen.
    if plan.amount <= Decimal("0"):
        subscription = Subscription(
            business_id=business.id,
            plan_id=plan.id,
            status=SubscriptionStatus.active,
        )
        db.add(subscription)
        db.flush()
        _retire_abandoned_checkouts(db, business.id, keep_id=subscription.id)
        db.commit()
        db.refresh(subscription)
        log_audit(
            db,
            actor=f"user:{current_user.id}",
            action="subscription.free_plan_activated",
            target_table="subscriptions",
            target_id=subscription.id,
            metadata={"business_id": business.id, "plan_id": plan.id},
        )
        return CheckoutSessionOut(
            checkout_url=payload.success_url or settings.stripe_success_url,
            session_id=None,
            subscription_id=subscription.id,
            status=subscription.status,
            requires_payment=False,
            stub=not payment_gateway.gateway_configured(),
        )

    try:
        session = payment_gateway.create_checkout_session(
            business_id=business.id,
            plan_price_id=plan.stripe_price_id,
            customer_email=business.email or current_user.email,
            success_url=payload.success_url or settings.stripe_success_url,
            cancel_url=payload.cancel_url or settings.stripe_cancel_url,
            metadata={"business_id": str(business.id), "plan_id": str(plan.id)},
        )
    except payment_gateway.PaymentGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not start checkout: {exc}",
        ) from exc

    # Reuse an abandoned attempt at the same plan rather than accumulating a
    # row per click of a button somebody keeps not finishing.
    subscription = db.scalar(
        select(Subscription)
        .where(
            Subscription.business_id == business.id,
            Subscription.plan_id == plan.id,
            Subscription.status == SubscriptionStatus.incomplete,
        )
        .order_by(Subscription.id.desc())
    )
    if subscription is None:
        subscription = Subscription(business_id=business.id, plan_id=plan.id)
        db.add(subscription)

    subscription.status = SubscriptionStatus.incomplete
    subscription.gateway_customer_id = session.customer_id
    subscription.gateway_checkout_session_id = session.session_id
    db.commit()
    db.refresh(subscription)

    log_audit(
        db,
        actor=f"user:{current_user.id}",
        action="subscription.checkout_started",
        target_table="subscriptions",
        target_id=subscription.id,
        metadata={
            "business_id": business.id,
            "plan_id": plan.id,
            "session_id": session.session_id,
            "stub": session.stub,
        },
    )

    return CheckoutSessionOut(
        checkout_url=session.url,
        session_id=session.session_id,
        subscription_id=subscription.id,
        status=subscription.status,
        stub=session.stub,
    )


@router.get("/businesses/{business_id}/subscription", response_model=SubscriptionOut)
def get_business_subscription(
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> Subscription:
    """The listing's current subscription. Owner or admin only.

    404 when there has never been one, so a client can tell "not subscribed"
    from "subscribed and lapsed" - the second needs a different message.
    """
    subscription = db.scalar(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.business_id == business.id)
        # Newest first: a re-subscription after a cancellation is the current
        # state, and the cancelled row is history.
        .order_by(Subscription.id.desc())
    )
    if subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This listing has no subscription.",
        )
    return subscription


@router.post(
    "/subscriptions/{subscription_id}/stub-payment", response_model=SubscriptionOut
)
def pay_with_test_card(
    subscription_id: int,
    payload: StubPaymentRequest,
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> Subscription:
    """Pay for an incomplete subscription with a test card. Stub mode only.

    Stands in for the hosted payment page that does not exist until Stripe is
    configured. The same result a checkout.session.completed webhook would
    produce: the row goes active with a gateway id and a paid-up-to date.

    402 with a customer-facing message when the card is declined, so the form
    can show it and let them try again. 409 when there is nothing to pay for -
    already active, cancelled, or a real gateway is configured and the customer
    must pay through checkout instead.
    """
    subscription = db.scalar(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.id == subscription_id)
    )
    if subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found"
        )

    business = db.get(Business, subscription.business_id)
    is_admin = current_user.is_admin or current_user.role is UserRole.admin
    if business is None or (business.owner_id != current_user.id and not is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this subscription",
        )

    if subscription.status is not SubscriptionStatus.incomplete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This subscription is {subscription.status.value}; there is nothing to pay.",
        )

    try:
        charge = payment_gateway.charge_stub_card(
            card_number=payload.card_number,
            exp_month=payload.exp_month,
            exp_year=payload.exp_year,
            cvc=payload.cvc,
            billing_cycle=subscription.plan.billing_cycle.value,
        )
    except payment_gateway.PaymentDeclined as exc:
        digits = "".join(ch for ch in payload.card_number if ch.isdigit())
        log_audit(
            db,
            actor=f"user:{current_user.id}",
            action="subscription.stub_payment_declined",
            target_table="subscriptions",
            target_id=subscription.id,
            # Never the card number - the last four digits identify which test
            # card was used, and that is all an audit trail needs.
            metadata={"last4": digits[-4:], "reason": str(exc)},
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    except payment_gateway.PaymentGatewayError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    subscription.status = SubscriptionStatus.active
    subscription.gateway_subscription_id = charge.gateway_subscription_id
    subscription.current_period_end = charge.current_period_end
    _retire_abandoned_checkouts(db, subscription.business_id, keep_id=subscription.id)
    db.commit()
    db.refresh(subscription)

    log_audit(
        db,
        actor=f"user:{current_user.id}",
        action="subscription.stub_payment_succeeded",
        target_table="subscriptions",
        target_id=subscription.id,
        metadata={
            "business_id": subscription.business_id,
            "plan_id": subscription.plan_id,
            "brand": charge.brand,
            "last4": charge.last4,
            "amount": str(subscription.plan.amount),
            "currency": subscription.plan.currency,
        },
    )
    return subscription


@router.post("/subscriptions/{subscription_id}/cancel", response_model=SubscriptionOut)
def cancel(
    subscription_id: int,
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> Subscription:
    """Cancel a subscription.

    Not in the original four routes, but cancel_subscription() would otherwise
    be a stub nothing calls - and an owner who can subscribe from the API and
    not unsubscribe from it is a support ticket.
    """
    subscription = db.get(Subscription, subscription_id)
    if subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found"
        )

    business = db.get(Business, subscription.business_id)
    is_admin = current_user.is_admin or current_user.role is UserRole.admin
    if business is None or (business.owner_id != current_user.id and not is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this subscription",
        )

    try:
        reached_gateway = payment_gateway.cancel_subscription(
            subscription.gateway_subscription_id
        )
    except payment_gateway.PaymentGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not cancel at the gateway: {exc}",
        ) from exc

    subscription.status = SubscriptionStatus.canceled
    subscription.canceled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(subscription)

    log_audit(
        db,
        actor=f"user:{current_user.id}",
        action="subscription.canceled",
        target_table="subscriptions",
        target_id=subscription.id,
        metadata={
            "business_id": subscription.business_id,
            "reached_gateway": reached_gateway,
        },
    )
    return subscription


@router.post("/webhooks/stripe", response_model=WebhookAck)
async def stripe_webhook(
    request: Request, db: Session = Depends(get_db)
) -> WebhookAck:
    """Receive subscription lifecycle events from the gateway.

    Unauthenticated by necessity - Stripe has no account here - so the
    signature IS the authentication, and it is checked against the raw body
    before anything else reads it.

    Unknown event types return 200 with handled=false. A non-2xx tells Stripe
    to retry, and asking it to keep redelivering an event we deliberately
    ignore is how a webhook endpoint ends up rate-limited.
    """
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    try:
        event = payment_gateway.verify_webhook_signature(payload, signature)
    except payment_gateway.PaymentGatewayError as exc:
        # 400, not 403: Stripe treats 4xx as "do not retry", which is right for
        # a body that will never verify.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Webhook rejected: {exc}",
        ) from exc

    handled = False
    touched_id: int | None = None
    data = event.data

    if event.event_type == "checkout.session.completed":
        session_id = str(data.get("id", ""))
        subscription = db.scalar(
            select(Subscription).where(
                Subscription.gateway_checkout_session_id == session_id
            )
        )
        if subscription is not None:
            subscription.status = SubscriptionStatus.active
            subscription.gateway_subscription_id = (
                str(data.get("subscription")) if data.get("subscription") else None
            )
            if data.get("customer"):
                subscription.gateway_customer_id = str(data["customer"])
            subscription.current_period_end = _period_end(
                data.get("current_period_end")
            )
            db.commit()
            handled = True
            touched_id = subscription.id

    elif event.event_type in {
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        gateway_id = str(data.get("id", ""))
        subscription = db.scalar(
            select(Subscription).where(
                Subscription.gateway_subscription_id == gateway_id
            )
        )
        if subscription is not None:
            if event.event_type == "customer.subscription.deleted":
                new_status = SubscriptionStatus.canceled
            else:
                new_status = _STATUS_FROM_GATEWAY.get(
                    str(data.get("status", "")), subscription.status
                )
            subscription.status = new_status
            subscription.current_period_end = (
                _period_end(data.get("current_period_end"))
                or subscription.current_period_end
            )
            if new_status is SubscriptionStatus.canceled:
                subscription.canceled_at = datetime.now(timezone.utc)
            db.commit()
            handled = True
            touched_id = subscription.id

    # audit_log.target_id is NOT NULL, so only a webhook that actually moved a
    # row gets a trail entry. An event for a subscription this app has never
    # heard of has no row to point at.
    if handled and touched_id is not None:
        log_audit(
            db,
            actor="stripe:webhook",
            action=f"subscription.webhook.{event.event_type}",
            target_table="subscriptions",
            target_id=touched_id,
            metadata={"event_id": event.event_id, "stub": event.stub},
        )

    return WebhookAck(received=True, handled=handled, event_type=event.event_type)
