"""Lead capture and the owner's leads inbox.

Two endpoints with deliberately opposite access rules on the same resource:

  POST /businesses/{id}/enquiries  - anyone, signed in or not, may leave a lead
  GET  /businesses/{id}/enquiries  - only the listing's owner may read them

Getting that asymmetry wrong in either direction is the whole risk here: a
locked-down POST loses leads from anonymous visitors, and a loose GET exposes
one business's customer list to another.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user_optional, require_owned_business
from app.core.rate_limit import rate_limit
from app.core.visibility import require_visible_business
from app.models.business import Business
from app.models.enquiry import Enquiry, EnquiryType
from app.models.user import User
from app.schemas.directory import EnquiryAck, EnquiryCreate, EnquiryOut

router = APIRouter(prefix="/businesses", tags=["directory"])

MAX_PAGE_SIZE = 100


@router.post(
    "/{business_id}/enquiries",
    response_model=EnquiryAck,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("enquiry", 10, 3600))],
)
def create_enquiry(
    business_id: int,
    payload: EnquiryCreate,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Enquiry:
    """Record a lead against a listing. Open to anonymous visitors."""
    # Only a publicly visible listing can receive leads - the same rule as
    # search and the detail page. A listing a visitor cannot reach is either a
    # stale tab or someone poking at ids, and an unverified business must not
    # collect leads through a page nobody was supposed to see.
    business = require_visible_business(db, business_id)

    enquiry = Enquiry(
        business_id=business.id,
        user_id=current_user.id if current_user is not None else None,
        enquiry_type=payload.enquiry_type,
        message=payload.message,
        # Fall back to the signed-in user's own details when the form did not
        # collect them - a call-click has no form at all.
        contact_name=payload.contact_name
        or (current_user.name if current_user is not None else None),
        contact_phone=payload.contact_phone
        or (current_user.phone if current_user is not None else None),
        contact_email=payload.contact_email
        or (current_user.email if current_user is not None else None),
    )
    db.add(enquiry)
    db.commit()
    db.refresh(enquiry)
    return enquiry


@router.get("/{business_id}/enquiries", response_model=list[EnquiryOut])
def list_enquiries(
    business: Business = Depends(require_owned_business),
    enquiry_type: EnquiryType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Enquiry]:
    """Leads for a listing the caller owns, newest first.

    Ownership is enforced by require_owned_business, which 404s an unknown
    listing and 403s somebody else's.
    """
    stmt = select(Enquiry).where(Enquiry.business_id == business.id)
    if enquiry_type is not None:
        stmt = stmt.where(Enquiry.enquiry_type == enquiry_type)

    return list(
        db.scalars(
            # id as tiebreak: two leads can share a timestamp, and without it
            # the order is undefined and offset paging can repeat rows.
            stmt.order_by(Enquiry.created_at.desc(), Enquiry.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
