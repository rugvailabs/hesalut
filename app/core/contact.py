"""Phone numbers are for signed-in visitors.

Anyone can search, open a listing and read its reviews. The phone and WhatsApp
numbers are the one thing withheld until sign-in: revealing a number is what
records a lead for the business (a call_click enquiry), and a lead needs a
person behind it. Email and website stay public.

The number is blanked and `contact_hidden` set, so a client can tell "sign in
to see the number" apart from "no number listed".
"""

from __future__ import annotations

from typing import TypeVar

from app.schemas.directory import BusinessDetail, BusinessListItem

Listing = TypeVar("Listing", BusinessListItem, BusinessDetail)


def hide_numbers_from_guests(listing: Listing) -> Listing:
    """A copy of `listing` with its phone (and WhatsApp) number withheld."""
    if isinstance(listing, BusinessDetail):
        hidden = listing.phone is not None or listing.whatsapp is not None
        return listing.model_copy(
            update={"phone": None, "whatsapp": None, "contact_hidden": hidden}
        )
    return listing.model_copy(
        update={"phone": None, "contact_hidden": listing.phone is not None}
    )
