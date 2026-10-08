"""Wire shapes for the owner's lead notifications."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LeadNotification(BaseModel):
    """New leads on one listing: those that arrived since the owner last looked."""

    business_id: int
    business_name: str
    new_leads: int
    # What "new" is measured against. The leads page uses it to tag the new ones.
    leads_seen_at: datetime


class LeadNotifications(BaseModel):
    """Every listing the caller owns, and the total across them."""

    total_new: int
    businesses: list[LeadNotification]
