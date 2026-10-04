"""v1 API routers."""

from fastapi import APIRouter

from app.api.v1 import (
    admin_businesses,
    admin_enquiries,
    admin_overview,
    audit,
    auth,
    bookings,
    businesses,
    business_reviews,
    businesses_owner,
    chat,
    categories,
    enquiries,
    favorites,
    payments,
    profile,
    registration,
    search,
    support,
    verification,
)
from app.core.config import get_settings

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_businesses.router)
api_router.include_router(admin_enquiries.router)
api_router.include_router(admin_overview.router)
api_router.include_router(auth.router)
api_router.include_router(audit.router)
api_router.include_router(bookings.router)
api_router.include_router(businesses.router)
api_router.include_router(businesses_owner.router)
api_router.include_router(enquiries.router)
api_router.include_router(favorites.router)
api_router.include_router(business_reviews.router)
api_router.include_router(categories.router)
api_router.include_router(chat.router)
api_router.include_router(payments.router)
api_router.include_router(profile.router)
api_router.include_router(registration.router)
api_router.include_router(search.router)
api_router.include_router(support.router)
api_router.include_router(verification.router)

# The legacy voice-submission app. Imported only when enabled: its modules pull
# in the Celery app and the ClamAV client, which a directory-only deployment
# neither installs services for nor needs. See Settings.voice_pipeline_enabled.
if get_settings().voice_pipeline_enabled:
    from app.api.v1 import consents, review, submissions

    api_router.include_router(consents.router)
    api_router.include_router(review.router)
    api_router.include_router(submissions.router)

__all__ = ["api_router"]
