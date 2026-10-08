"""What is new for a business owner.

    GET  /notifications/leads                          new leads, per listing and in total
    POST /notifications/leads/{business_id}/seen       the owner has looked at that listing's leads

A lead is new when it arrived after the listing's `leads_seen_at`. Opening the
leads page moves that marker forward, which is the whole of "mark as read": one
timestamp per listing, not a flag on every lead.

Ownership follows the rest of the owner API: the list covers only the caller's
own listings, and the seen route goes through require_owned_business.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select, update
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_business_owner, require_owned_business
from app.models.business import Business
from app.models.enquiry import Enquiry
from app.models.user import User
from app.schemas.notifications import LeadNotification, LeadNotifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


def lead_notifications(db: Session, owner_id: int) -> LeadNotifications:
    rows = db.execute(
        select(
            Business.id,
            Business.name,
            Business.leads_seen_at,
            func.count(Enquiry.id),
        )
        .outerjoin(
            Enquiry,
            and_(
                Enquiry.business_id == Business.id,
                Enquiry.created_at > Business.leads_seen_at,
            ),
        )
        .where(Business.owner_id == owner_id)
        .group_by(Business.id)
        .order_by(Business.id)
    ).all()

    businesses = [
        LeadNotification(
            business_id=business_id,
            business_name=name,
            new_leads=count,
            leads_seen_at=seen_at,
        )
        for business_id, name, seen_at, count in rows
    ]
    return LeadNotifications(
        total_new=sum(item.new_leads for item in businesses), businesses=businesses
    )


@router.get("/leads", response_model=LeadNotifications)
def get_lead_notifications(
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> LeadNotifications:
    """New leads on each of the caller's listings, and the total."""
    return lead_notifications(db, current_user.id)


@router.post("/leads/{business_id}/seen", response_model=LeadNotifications)
def mark_leads_seen(
    business: Business = Depends(require_owned_business),
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> LeadNotifications:
    """The owner has looked at this listing's leads: nothing is new any more.

    Uses the database clock, the same one that stamps each lead's created_at,
    so a lead that lands a moment later still counts as new.
    """
    db.execute(
        update(Business).where(Business.id == business.id).values(leads_seen_at=func.now())
    )
    db.commit()
    return lead_notifications(db, current_user.id)
