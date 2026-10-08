"""Wire shapes for choosing and paying for a plan after verification."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.verification import VerificationStatus
from app.schemas.registration import ReceiptOut, TermsAcceptance
from app.schemas.subscription import SubscriptionOut


class BillingSubscribe(TermsAcceptance):
    """Choose a plan. A paid plan also carries a test-checkout card.

    The amount is never sent: the server charges what its own order summary
    for this plan and this business's province says.
    """

    plan_id: int = Field(gt=0)
    card_number: str | None = Field(default=None, max_length=32)
    exp_month: int | None = Field(default=None, ge=0, le=99)
    exp_year: int | None = Field(default=None, ge=0, le=9999)
    cvc: str | None = Field(default=None, max_length=8)
    cardholder_name: str | None = Field(default=None, max_length=255)


class BillingState(BaseModel):
    """What the billing page needs to decide what to show."""

    business_id: int
    # None when no documents have been submitted yet.
    verification_status: VerificationStatus | None
    # True once verified and not already subscribed.
    can_subscribe: bool
    # Why not, in words for the owner. None when they can.
    blocked_reason: str | None
    subscription: SubscriptionOut | None = None
    receipt: ReceiptOut | None = None
