"""Schemas for the public directory: categories and business search."""

from __future__ import annotations

import enum
import uuid

from datetime import datetime
from typing import Any, Literal

from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from app.models.business import BusinessStatus
from app.models.enquiry import EnquiryType


class BusinessSort(str, enum.Enum):
    """Ordering for /businesses/search.

    `distance` is only meaningful when lat/lng are supplied; the endpoint
    rejects it otherwise rather than silently falling back.
    """

    relevance = "relevance"
    rating = "rating"
    reviews = "reviews"
    distance = "distance"
    name = "name"
    newest = "newest"
    # Cheapest first by price level ($ before $$$$); unpriced listings last.
    price = "price"


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    parent_id: int | None
    description: str | None
    icon: str | None
    # Active listings directly in this category. Rendered on the category grid.
    business_count: int = 0


class BusinessListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    category_slug: str
    category_name: str
    description: str | None
    address: str | None
    city: str
    province: str
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    website: str | None
    # NULL when the listing has no ratings yet - render "No reviews yet",
    # not zero stars.
    rating: float | None
    review_count: int
    verified: bool
    # "$" to "$$$$", or None when the owner has not said.
    price_range: str | None = None
    # {"mon": [["09:00", "17:00"]], ...}, or None. Carried so a card can say
    # "Open now" from the same data the profile page uses.
    opening_hours: dict[str, Any] | None = None
    # When the listing went up - for "Recently added".
    created_at: datetime | None = None
    # Great-circle distance from the ?lat/?lng the caller passed. Absent from
    # every response that did not supply a point to measure from.
    distance_km: float | None = None
    # Paid placement (app/services/placement.py). Results arrive already
    # ordered by it; these say why, so the page can label paid positions.
    subscription_tier: Literal["annual", "monthly", "basic", "none"] = "none"
    # True for Annual subscribers.
    is_featured: bool = False
    # "⭐" for Annual, "📈" for Monthly, otherwise None.
    featured_badge: str | None = None
    # What the card shows: "⭐ Featured" / "📈 Promoted", otherwise None.
    badge: str | None = None
    # "Featured Business" / "Promoted Business", otherwise None.
    badge_label: str | None = None
    # 1 Annual, 2 Monthly, 3 Basic; None without a live plan.
    display_priority: int | None = None
    # 1-based place in the whole result set, across pages.
    position: int = 0
    # Monthly only: one of this half hour's three rotation leaders.
    in_rotation: bool = False
    # Why it is placed here: tier, rotation, and rank within the tier.
    display_reason: str = ""


class SearchResponse(BaseModel):
    items: list[BusinessListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool
    # Identifies this page of results for click tracking (POST /search/clicks).
    # None when nothing was logged: no results, or track=false.
    search_id: uuid.UUID | None = None


class BusinessOwnerItem(BaseModel):
    """A listing as its owner sees it - includes the moderation status."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    category_id: int
    status: BusinessStatus
    city: str
    province: str
    address: str | None
    rating: float | None
    review_count: int
    is_active: bool
    verified: bool
    # Why a listing was rejected or suspended. Shown to the owner - a decision
    # they cannot understand is a dead end.
    moderation_note: str | None = None
    moderated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BusinessDetail(BusinessOwnerItem):
    """Everything the edit form needs to round-trip a listing."""

    description: str | None
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    whatsapp: str | None
    email: str | None
    website: str | None
    price_range: str | None
    # "owner" or "services": whether price_range was chosen or derived.
    price_range_source: str = "owner"
    tags: list[str] | None
    opening_hours: dict[str, Any] | None
    # "none" or "external"; the link is only meaningful in external mode.
    booking_mode: str = "none"
    booking_url: str | None = None
    timezone: str | None = None
    cancellation_policy: str | None = None
    cancellation_window_hours: int = 24
    owner_id: int | None
    category_slug: str | None = None
    category_name: str | None = None


BookingMode = Literal["none", "external", "request"]


def _check_timezone(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    from app.services.booking_rules import is_valid_zone

    if not is_valid_zone(value.strip()):
        raise ValueError("Unknown time zone, for example America/Vancouver")
    return value.strip()


def _check_booking_url(value: str | None) -> str | None:
    """An https URL with a host, or None. Blank counts as unset.

    https only: the link is rendered as a button on a public page, and a
    javascript:, data: or plain-http target must never be reachable from it.
    """
    if value is None or not value.strip():
        return None
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        raise ValueError("Booking link must be a full https:// address")
    return value


class BusinessCreate(BaseModel):
    """Owner-supplied fields for a new listing.

    Deliberately omits status, owner_id, rating, review_count and verified:
    those are set by the server. Accepting them from the client would let an
    owner self-approve or invent a rating.
    """

    name: str = Field(min_length=1, max_length=255)
    category_id: int
    description: str | None = Field(default=None, max_length=5000)
    address: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    province: str = Field(default="BC", min_length=2, max_length=2)
    postal_code: str | None = Field(default=None, max_length=16)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=320)
    website: HttpUrl | None = None
    price_range: str | None = Field(default=None, max_length=8)
    tags: list[str] | None = None
    opening_hours: dict[str, Any] | None = None
    booking_mode: BookingMode = "none"
    booking_url: str | None = Field(default=None, max_length=512)
    timezone: str | None = Field(default=None, max_length=64)
    cancellation_policy: str | None = Field(default=None, max_length=1000)
    cancellation_window_hours: int = Field(default=24, ge=0, le=720)

    _v_booking_url = field_validator("booking_url")(_check_booking_url)
    _v_timezone = field_validator("timezone")(_check_timezone)


class BusinessUpdate(BaseModel):
    """PATCH payload. Every field optional; omitted fields are left alone."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: int | None = None
    description: str | None = Field(default=None, max_length=5000)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, min_length=1, max_length=128)
    province: str | None = Field(default=None, min_length=2, max_length=2)
    postal_code: str | None = Field(default=None, max_length=16)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=320)
    website: HttpUrl | None = None
    price_range: str | None = Field(default=None, max_length=8)
    tags: list[str] | None = None
    opening_hours: dict[str, Any] | None = None
    booking_mode: BookingMode | None = None
    booking_url: str | None = Field(default=None, max_length=512)
    timezone: str | None = Field(default=None, max_length=64)
    cancellation_policy: str | None = Field(default=None, max_length=1000)
    cancellation_window_hours: int | None = Field(default=None, ge=0, le=720)
    # The owner may pause a listing, but cannot change its moderation status.
    is_active: bool | None = None

    _v_booking_url = field_validator("booking_url")(_check_booking_url)
    _v_timezone = field_validator("timezone")(_check_timezone)


class EnquiryCreate(BaseModel):
    """A lead posted from a public listing page.

    Anonymous callers are allowed, so contact details ride on the payload.
    `call_click` carries no message - it just records that someone revealed
    the number.
    """

    enquiry_type: EnquiryType
    message: str | None = Field(default=None, max_length=2000)
    contact_name: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=32)
    contact_email: str | None = Field(default=None, max_length=320)


class EnquiryOut(BaseModel):
    """A lead as its owner sees it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    enquiry_type: EnquiryType
    message: str | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    # Present when the enquiry came from a signed-in customer.
    user_id: int | None
    created_at: datetime


class AdminEnquiryOut(EnquiryOut):
    """A lead as a moderator sees it: the same row plus who it was for.

    The business name and slug are joined in because a global inbox listing
    fifty leads by business_id is unreadable, and making the client resolve
    fifty ids is fifty requests.
    """

    business_name: str
    business_slug: str


class AdminEnquiryPage(BaseModel):
    """One page of the global inbox, with the total for the pager."""

    items: list[AdminEnquiryOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class EnquiryAck(BaseModel):
    """Deliberately thin: the public endpoint confirms receipt and nothing more.

    Echoing the stored row back would let anyone enumerate a business's leads
    by posting one and reading the response.
    """

    id: int
    created_at: datetime


class BusinessReviewCreate(BaseModel):
    """A customer's review. Requires an account - see the endpoint."""

    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=255)
    body: str | None = Field(default=None, max_length=5000)


class OwnerReplyCreate(BaseModel):
    """The owner's single reply to a review."""

    reply: str = Field(min_length=1, max_length=2000)


class BusinessReviewOut(BaseModel):
    """A review as shown publicly and in the owner's dashboard.

    Carries the author's display name but never their email: the review page
    is public, and a reviewer has not consented to publishing their address.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    rating: int
    title: str | None
    body: str | None
    owner_reply: str | None
    owner_replied_at: datetime | None
    created_at: datetime
    author_id: int
    author_name: str


class BusinessReviewSummary(BaseModel):
    """Aggregate shown above the review list."""

    average_rating: float | None
    review_count: int
    # rating value -> how many reviews gave it, for the 5..1 histogram.
    breakdown: dict[int, int]


class ModerationDecision(BaseModel):
    """Reason attached to a moderation decision.

    Required for reject and suspend, optional on approve - an owner needs to
    know why they were turned down, not why they were let through.
    """

    reason: str = Field(
        min_length=3,
        max_length=1000,
        description="Shown to the listing owner. Recorded against the listing.",
    )


class ModerationQueueItem(BaseModel):
    """A listing as the moderator sees it, with enough context to decide."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    status: BusinessStatus
    city: str
    province: str
    address: str | None
    description: str | None
    phone: str | None
    website: str | None
    category_name: str
    owner_id: int | None
    # Admin-only surface, so identifying the submitter is appropriate here in
    # a way it never is on the public listing page.
    owner_email: str | None
    moderation_note: str | None
    moderated_at: datetime | None
    created_at: datetime


class ModerationStats(BaseModel):
    pending: int
    approved: int
    rejected: int
    suspended: int


class AdminStats(BaseModel):
    """Counts for the admin landing page."""

    total_businesses: int
    pending_listings: int
    approved_listings: int
    rejected_listings: int
    suspended_listings: int
    total_users: int
    total_reviews: int
    total_enquiries: int
    total_conversations: int
    #: KYC submissions waiting on a reviewer. Separate from pending_listings:
    #: they are two queues and a moderator clears them separately.
    pending_verifications: int


class AdminReviewItem(BaseModel):
    """A review as a moderator sees it.

    Carries the author's email, which the public review list deliberately
    withholds: moderating means knowing who wrote something.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    business_name: str
    business_slug: str
    rating: int
    title: str | None
    body: str | None
    owner_reply: str | None
    author_id: int
    author_name: str
    author_email: str
    created_at: datetime


class FavoriteOut(BaseModel):
    """One saved listing, as the saved-listings panel shows it."""

    business_id: int
    slug: str
    name: str
    category_slug: str
    category_name: str
    city: str
    province: str
    phone: str | None
    rating: float | None
    review_count: int
    saved_at: datetime


class CityCount(BaseModel):
    """A city with public listings, and how many."""

    city: str
    province: str
    business_count: int
