"""All ORM models, imported here so Base.metadata is fully populated.

Alembic autogenerate only sees tables that have been imported, so every new
model file must be added to this module.
"""

from app.models.audit_log import AuditLog
from app.models.base import Base
from app.models.business import Business, BusinessStatus
from app.models.booking_link_click import BookingLinkClick
from app.models.business_review import BusinessReview
from app.models.category import Category
from app.models.chat import Conversation, Message
from app.models.consent import Consent, ConsentType
from app.models.enquiry import Enquiry, EnquiryType
from app.models.favorite import Favorite
from app.models.extracted_problem import ExtractedProblem, Urgency
from app.models.match import Match, MatchType
from app.models.message_sent import (
    MessageChannel,
    MessageSent,
    MessageStatus,
)
from app.models.payment import Payment
from app.models.provider import Provider
from app.models.review_queue import ReviewDecision, ReviewQueue
from app.models.search_impression import SearchImpression
from app.models.support import SupportKind, SupportMessage
from app.models.submission import InputType, Submission, SubmissionStatus
from app.models.subscription import (
    BillingCycle,
    Plan,
    Subscription,
    SubscriptionStatus,
)
from app.models.verification import BusinessVerification, VerificationStatus
from app.models.user import PreferredContactMethod, User, UserRole

__all__ = [
    "AuditLog",
    "Base",
    "Business",
    "BookingLinkClick",
    "BusinessStatus",
    "BusinessReview",
    "BusinessVerification",
    "VerificationStatus",
    "BillingCycle",
    "Plan",
    "Subscription",
    "SubscriptionStatus",
    "Category",
    "Consent",
    "ConsentType",
    "Conversation",
    "Message",
    "Enquiry",
    "EnquiryType",
    "ExtractedProblem",
    "Favorite",
    "Urgency",
    "Match",
    "MatchType",
    "MessageChannel",
    "MessageSent",
    "MessageStatus",
    "Payment",
    "Provider",
    "ReviewQueue",
    "ReviewDecision",
    "SearchImpression",
    "SupportKind",
    "SupportMessage",
    "Submission",
    "InputType",
    "SubmissionStatus",
    "PreferredContactMethod",
    "User",
    "UserRole",
]
