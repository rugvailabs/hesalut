"""Wire shapes for business registration, and the order and receipt shapes billing shares."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.subscription import PlanOut
from app.services.sales_tax import PROVINCE_CODES


class BusinessDetailsIn(BaseModel):
    """The business half of step 1, saved until registration completes."""

    business_name: str = Field(min_length=1, max_length=255)
    category_id: int = Field(gt=0)
    address: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    province: str = Field(min_length=2, max_length=2)
    postal_code: str | None = Field(default=None, max_length=16)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("province")
    @classmethod
    def _known_province(cls, value: str) -> str:
        code = value.strip().upper()
        if code not in PROVINCE_CODES:
            raise ValueError("Choose a Canadian province or territory")
        return code

    @field_validator("business_name", "city")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("This field is required")
        return value.strip()


class RegistrationStart(BusinessDetailsIn):
    """Step 1 for someone without an account yet."""

    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=32)
    # bcrypt silently truncates beyond 72 bytes, so cap it here instead.
    password: str = Field(min_length=8, max_length=72)


class RegistrationDetailsUpdate(BusinessDetailsIn):
    """Step 1 again, after going back. Email and password are not changed here."""

    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=32)


class TermsAcceptance(BaseModel):
    # Must be true: a recurring charge rests on the customer's express consent
    # to it, and a free plan still accepts the terms of use.
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def _must_accept(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Accept the terms to continue")
        return value


class TaxLineOut(BaseModel):
    name: str
    rate: Decimal
    amount: Decimal


class OrderSummary(BaseModel):
    """What the plan page shows and what the charge will be, computed server-side."""

    plan: PlanOut
    currency: str
    subtotal: Decimal
    tax_lines: list[TaxLineOut]
    tax_total: Decimal
    total: Decimal
    province: str
    requires_payment: bool
    # "1 month" / "12 months"; None for a free plan.
    period_label: str | None
    # When the first paid period would end if paid now - the renewal date.
    renews_on: datetime | None
    # Taxes that apply in some provinces but are not being collected yet.
    uncollected_taxes: list[str]


class ReceiptOut(BaseModel):
    receipt_number: str
    created_at: datetime
    currency: str
    subtotal: Decimal
    tax_lines: list[TaxLineOut]
    tax_total: Decimal
    total: Decimal
    province: str
    card_brand: str | None
    card_last4: str | None
    # "stub" for test-mode payments, where no money moved.
    gateway: str
    gst_hst_registration_number: str | None


class RegisteredBusiness(BaseModel):
    id: int
    name: str
    slug: str
    status: str


class AccountOut(BaseModel):
    name: str
    email: EmailStr
    phone: str | None


class RegistrationState(BaseModel):
    """Everything /register needs to render any step and resume."""

    # The furthest step reached (1-3). The page may show an earlier one.
    step: int
    completed: bool
    account: AccountOut
    details: BusinessDetailsIn | None
    # Set once registration is complete.
    business: RegisteredBusiness | None = None


class RegistrationStarted(BaseModel):
    access_token: str
    token_type: str = "bearer"
    state: RegistrationState
