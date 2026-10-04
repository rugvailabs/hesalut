"""Booking requests and the services a business offers.

Customer (signed in)
    POST   /bookings                              ask for a service, suggesting 1-3 times
    GET    /bookings/mine                         my bookings, newest first
    GET    /bookings/{id}                         one booking (customer, its owner, or admin)
    POST   /bookings/{id}/cancel                  withdraw a request / cancel a confirmed booking

Owner (of that listing only)
    GET    /businesses/{id}/bookings              requests and bookings, pending first
    POST   /businesses/{id}/bookings/{bid}/accept       confirm one of the suggested times
    POST   /businesses/{id}/bookings/{bid}/decline      say no, with a message
    POST   /businesses/{id}/bookings/{bid}/cancel       cancel a confirmed booking, with a reason
    POST   /businesses/{id}/bookings/{bid}/complete     the visit happened
    POST   /businesses/{id}/bookings/{bid}/no-show      the customer did not turn up
    GET/POST/PATCH/DELETE /businesses/{id}/services     what can be booked

Public
    GET    /businesses/{id}/booking-info          services and rules for the booking form

Admin (read only)
    GET    /admin/bookings, /admin/bookings.csv

There is no background job. Whenever bookings are read, requests nobody
answered in 48 hours (or whose suggested times have all passed) are marked
expired, and confirmed bookings nobody closed out are marked completed after
three days - see `settle`.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import Response
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.deps import get_current_user, require_admin, require_owned_business
from app.core.rate_limit import rate_limit
from app.core.visibility import require_visible_business
from app.models.booking import BookableService, Booking, BookingProposedTime, BookingStatus
from app.models.business import Business
from app.models.category import Category
from app.models.user import User
from app.schemas.booking import (
    AcceptIn,
    AdminBookingPage,
    BookingCreate,
    BookingInfo,
    BookingOut,
    CancelIn,
    DeclineIn,
    ServiceIn,
    ServiceOut,
    ServiceUpdate,
)
from app.services import booking_notify, booking_rules

router = APIRouter(tags=["bookings"])

NOT_FOUND = "Booking not found"


# ---------------------------------------------------------------- helpers
def _now() -> datetime:
    return datetime.now(timezone.utc)


def settle(db: Session, *, business_id: int | None = None, customer_id: int | None = None) -> None:
    """Apply the time-based status changes to the rows about to be read."""
    now = _now()
    scope = []
    if business_id is not None:
        scope.append(Booking.business_id == business_id)
    if customer_id is not None:
        scope.append(Booking.customer_id == customer_id)

    has_future_time = (
        select(BookingProposedTime.id)
        .where(BookingProposedTime.booking_id == Booking.id, BookingProposedTime.ends_at > now)
        .exists()
    )
    db.execute(
        update(Booking)
        .where(
            Booking.status == BookingStatus.requested.value,
            or_(Booking.created_at < now - booking_rules.REQUEST_TTL, ~has_future_time),
            *scope,
        )
        .values(status=BookingStatus.expired.value)
        .execution_options(synchronize_session=False)
    )
    db.execute(
        update(Booking)
        .where(
            Booking.status == BookingStatus.confirmed.value,
            Booking.confirmed_end < now - booking_rules.AUTO_COMPLETE_AFTER,
            *scope,
        )
        .values(status=BookingStatus.completed.value)
        .execution_options(synchronize_session=False)
    )
    db.commit()


def _business_zone_name(business: Business) -> str:
    return str(booking_rules.zone_for(business.timezone, business.province))


def _to_out(booking: Booking, business: Business) -> BookingOut:
    now = _now()
    # BookingOut carries a few fields that live on the business; hand them to
    # from_attributes by setting them (unmapped) on the instance.
    booking.business_name = business.name  # type: ignore[attr-defined]
    booking.business_slug = business.slug  # type: ignore[attr-defined]
    booking.timezone = _business_zone_name(business)  # type: ignore[attr-defined]
    out = BookingOut.model_validate(booking)
    out.cancellation_policy = business.cancellation_policy
    if booking.status == BookingStatus.requested.value and booking.proposed_times:
        out.expires_at = min(
            booking.created_at + booking_rules.REQUEST_TTL,
            max(p.ends_at for p in booking.proposed_times),
        )
    if booking.status == BookingStatus.confirmed.value and booking.confirmed_start:
        out.inside_cancellation_window = booking.confirmed_start - now < timedelta(
            hours=business.cancellation_window_hours
        )
    return out


def _outs(db: Session, bookings: list[Booking]) -> list[BookingOut]:
    ids = {b.business_id for b in bookings}
    businesses = {
        b.id: b for b in db.scalars(select(Business).where(Business.id.in_(ids))).all()
    } if ids else {}
    return [_to_out(b, businesses[b.business_id]) for b in bookings]


def _load_business_booking(db: Session, business: Business, booking_id: int) -> Booking:
    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id, Booking.business_id == business.id)
        .options(selectinload(Booking.proposed_times))
        .with_for_update()
    )
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return booking


def _category_style(db: Session, business: Business) -> str | None:
    slug = db.scalar(select(Category.slug).where(Category.id == business.category_id))
    return booking_rules.style_for(slug)


def _service_or_404(db: Session, business: Business, service_id: int) -> BookableService:
    service = db.get(BookableService, service_id)
    if service is None or service.business_id != business.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return service


def _commit_confirmation(db: Session) -> None:
    """Commit, turning the database's no-overlap rule into a clear 409."""
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if getattr(error.orig, "pgcode", None) == "23P01":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "That time clashes with another confirmed booking. Choose a different time.",
            ) from error
        raise


# --------------------------------------------------------------- services
@router.get("/businesses/{business_id}/services", response_model=list[ServiceOut])
def list_services(
    business: Business = Depends(require_owned_business), db: Session = Depends(get_db)
) -> list[BookableService]:
    return list(
        db.scalars(
            select(BookableService)
            .where(BookableService.business_id == business.id)
            .order_by(BookableService.is_active.desc(), BookableService.id)
        )
    )


@router.post(
    "/businesses/{business_id}/services",
    response_model=ServiceOut,
    status_code=status.HTTP_201_CREATED,
)
def create_service(
    payload: ServiceIn,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BookableService:
    count = db.scalar(
        select(func.count()).select_from(BookableService).where(BookableService.business_id == business.id)
    )
    if (count or 0) >= 50:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A listing can have up to 50 services")
    service = BookableService(business_id=business.id, **payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/businesses/{business_id}/services/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BookableService:
    service = _service_or_404(db, business, service_id)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("is_active") is False:
        _require_other_service_if_requests(db, business, leaving=service)
    for key, value in updates.items():
        if key in {"name", "duration_minutes", "is_active"} and value is None:
            continue  # required columns: an explicit null means "no change"
        setattr(service, key, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete(
    "/businesses/{business_id}/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_service(
    service_id: int,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> None:
    """Stop offering a service. It is kept (inactive) so past bookings still name it."""
    service = _service_or_404(db, business, service_id)
    _require_other_service_if_requests(db, business, leaving=service)
    service.is_active = False
    db.commit()


def _require_other_service_if_requests(db: Session, business: Business, *, leaving: BookableService) -> None:
    if business.booking_mode != "request":
        return
    others = db.scalar(
        select(func.count())
        .select_from(BookableService)
        .where(
            BookableService.business_id == business.id,
            BookableService.is_active.is_(True),
            BookableService.id != leaving.id,
        )
    )
    if not others:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Booking requests are on, so at least one service has to stay. "
            "Turn booking requests off first, or add another service.",
        )


# ------------------------------------------------------------ public info
@router.get("/businesses/{business_id}/booking-info", response_model=BookingInfo)
def booking_info(business_id: int, db: Session = Depends(get_db)) -> BookingInfo:
    business = require_visible_business(db, business_id)
    style = _category_style(db, business)
    if business.booking_mode != "request" or style is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This business does not take booking requests")
    services = db.scalars(
        select(BookableService)
        .where(BookableService.business_id == business.id, BookableService.is_active.is_(True))
        .order_by(BookableService.id)
    ).all()
    return BookingInfo(
        business_id=business.id,
        style=style,  # type: ignore[arg-type]
        timezone=_business_zone_name(business),
        cancellation_policy=business.cancellation_policy,
        cancellation_window_hours=business.cancellation_window_hours,
        opening_hours=business.opening_hours,
        services=[ServiceOut.model_validate(s) for s in services],
    )


# --------------------------------------------------------------- customer
_KEY_PATTERN = re.compile(r"[A-Za-z0-9_-]{8,64}")


def _hash_request(payload: BookingCreate) -> str:
    """A stable fingerprint of what was asked for (consent is always true)."""
    canonical = json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _replay(db: Session, customer_id: int, key: str, request_hash: str) -> BookingOut | None:
    """The booking this key already made for this customer, if any."""
    existing = db.scalar(
        select(Booking).where(Booking.customer_id == customer_id, Booking.idempotency_key == key)
    )
    if existing is None:
        return None
    if existing.request_hash != request_hash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That Idempotency-Key was already used for a different request.",
        )
    settle(db, customer_id=customer_id)
    db.refresh(existing)
    business = db.get(Business, existing.business_id)
    assert business is not None
    return _to_out(existing, business)


@router.post(
    "/bookings",
    response_model=BookingOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("booking-request", 10, 3600))],
)
def create_booking(
    payload: BookingCreate,
    background: BackgroundTasks,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingOut:
    """Ask a business for a booking.

    Send an `Idempotency-Key` header (8-64 characters of letters, digits, `-`
    or `_`) and a retry of the same request - a double click, a dropped
    connection - returns the booking the first attempt made, with 200 instead
    of 201, rather than creating a second one. Reusing a key for a different
    request is a 409.
    """
    request_hash = None
    if idempotency_key is not None:
        if not _KEY_PATTERN.fullmatch(idempotency_key):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Idempotency-Key must be 8-64 letters, digits, '-' or '_'",
            )
        request_hash = _hash_request(payload)
        replay = _replay(db, current_user.id, idempotency_key, request_hash)
        if replay is not None:
            response.status_code = status.HTTP_200_OK
            return replay

    business = require_visible_business(db, payload.business_id)
    style = _category_style(db, business)
    if business.booking_mode != "request" or style is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This business does not take booking requests")
    if business.owner_id == current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot book your own listing")

    service = db.get(BookableService, payload.service_id)
    if service is None or service.business_id != business.id or not service.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose one of the listed services")

    settle(db, customer_id=current_user.id)
    waiting = db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.customer_id == current_user.id,
            Booking.business_id == business.id,
            Booking.status == BookingStatus.requested.value,
        )
    )
    if (waiting or 0) >= booking_rules.MAX_PENDING_PER_BUSINESS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "You already have several requests waiting on this business. Wait for a reply first.",
        )

    zone = booking_rules.zone_for(business.timezone, business.province)
    now = _now()
    try:
        proposals = [
            booking_rules.build_proposal(
                style=style,
                day=item.date,
                wall=item.time,
                part=item.part,
                duration_minutes=service.duration_minutes,
                opening_hours=business.opening_hours,
                zone=zone,
                now=now,
            )
            for item in payload.proposals
        ]
        booking_rules.check_proposals(proposals)
    except booking_rules.BookingRuleError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error

    booking = Booking(
        business_id=business.id,
        service_id=service.id,
        customer_id=current_user.id,
        style=style,
        service_name=service.name,
        service_name_fr=service.name_fr,
        duration_minutes=service.duration_minutes,
        price_cents=service.price_cents,
        customer_name=current_user.name,
        customer_email=current_user.email,
        customer_phone=(payload.phone or current_user.phone or None),
        note=" ".join(payload.note.split()) if payload.note and payload.note.strip() else None,
        consent_shared=True,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        proposed_times=[
            BookingProposedTime(starts_at=p.starts_at, ends_at=p.ends_at, part_of_day=p.part_of_day)
            for p in proposals
        ],
    )
    db.add(booking)
    try:
        db.commit()
    except IntegrityError:
        # Two copies of the same request raced past the lookup above; the
        # unique index let one in. Hand back the winner.
        db.rollback()
        replay = (
            _replay(db, current_user.id, idempotency_key, request_hash)
            if idempotency_key is not None and request_hash is not None
            else None
        )
        if replay is None:
            raise
        response.status_code = status.HTTP_200_OK
        return replay
    db.refresh(booking)
    background.add_task(_notify_requested, booking.id, db.get_bind())
    return _to_out(booking, business)


@router.get("/bookings/mine", response_model=list[BookingOut])
def my_bookings(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[BookingOut]:
    settle(db, customer_id=current_user.id)
    rows = db.scalars(
        select(Booking)
        .where(Booking.customer_id == current_user.id)
        .order_by(Booking.created_at.desc(), Booking.id.desc())
        .limit(200)
    ).all()
    return _outs(db, list(rows))


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingOut:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    business = db.get(Business, booking.business_id)
    assert business is not None
    allowed = (
        booking.customer_id == current_user.id
        or business.owner_id == current_user.id
        or current_user.is_admin
    )
    if not allowed:
        # Same answer as a booking that does not exist.
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    settle(db, business_id=business.id)
    db.refresh(booking)
    return _to_out(booking, business)


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
def customer_cancel(
    booking_id: int,
    payload: CancelIn,
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingOut:
    settle(db, customer_id=current_user.id)
    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id, Booking.customer_id == current_user.id)
        .options(selectinload(Booking.proposed_times))
        .with_for_update()
    )
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    business = db.get(Business, booking.business_id)
    assert business is not None

    if booking.status == BookingStatus.requested.value:
        pass
    elif booking.status == BookingStatus.confirmed.value:
        if booking.confirmed_end and booking.confirmed_end <= _now():
            raise HTTPException(status.HTTP_409_CONFLICT, "That booking is already over")
        # Inside the cancellation window the page shows the policy first, but
        # cancelling is still allowed: there are no fees until real payments exist.
    else:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {booking.status} booking cannot be cancelled")

    was_confirmed = booking.status == BookingStatus.confirmed.value
    booking.status = BookingStatus.cancelled.value
    booking.cancelled_by = "customer"
    booking.cancel_reason = _reason(payload.reason)
    booking.responded_at = booking.responded_at or _now()
    db.commit()
    db.refresh(booking)
    if was_confirmed:
        background.add_task(_notify_cancelled, booking.id, db.get_bind())
    return _to_out(booking, business)


def _reason(value: str | None) -> str | None:
    return " ".join(value.split()) or None if value else None


# ------------------------------------------------------------------ owner
@router.get("/businesses/{business_id}/bookings", response_model=list[BookingOut])
def owner_bookings(
    status_filter: str | None = Query(default=None, alias="status"),
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> list[BookingOut]:
    settle(db, business_id=business.id)
    query = select(Booking).where(Booking.business_id == business.id)
    if status_filter:
        if status_filter not in {s.value for s in BookingStatus}:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown status")
        query = query.where(Booking.status == status_filter)
    pending_first = case((Booking.status == BookingStatus.requested.value, 0), else_=1)
    rows = db.scalars(
        query.order_by(pending_first, Booking.created_at.desc(), Booking.id.desc()).limit(300)
    ).all()
    return [_to_out(b, business) for b in rows]


@router.post("/businesses/{business_id}/bookings/{booking_id}/accept", response_model=BookingOut)
def accept_booking(
    booking_id: int,
    payload: AcceptIn,
    background: BackgroundTasks,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BookingOut:
    settle(db, business_id=business.id)
    booking = _load_business_booking(db, business, booking_id)
    if booking.status == BookingStatus.expired.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has expired")
    if booking.status != BookingStatus.requested.value:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {booking.status} request cannot be accepted")

    chosen = next((p for p in booking.proposed_times if p.id == payload.proposed_time_id), None)
    if chosen is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose one of the suggested times")
    try:
        start, end = booking_rules.accepted_slot(
            style=booking.style,
            proposed_start=chosen.starts_at,
            proposed_end=chosen.ends_at,
            duration_minutes=booking.duration_minutes,
            chosen_start=payload.start,
        )
    except booking_rules.BookingRuleError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error
    if start < _now():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That time has already passed")

    booking.status = BookingStatus.confirmed.value
    booking.confirmed_start = start
    booking.confirmed_end = end
    booking.responded_at = _now()
    _commit_confirmation(db)
    db.refresh(booking)
    background.add_task(_notify_confirmed, booking.id, db.get_bind())
    return _to_out(booking, business)


@router.post("/businesses/{business_id}/bookings/{booking_id}/decline", response_model=BookingOut)
def decline_booking(
    booking_id: int,
    payload: DeclineIn,
    background: BackgroundTasks,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BookingOut:
    settle(db, business_id=business.id)
    booking = _load_business_booking(db, business, booking_id)
    if booking.status != BookingStatus.requested.value:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {booking.status} request cannot be declined")
    booking.status = BookingStatus.declined.value
    booking.decline_message = _reason(payload.message)
    booking.responded_at = _now()
    db.commit()
    db.refresh(booking)
    background.add_task(_notify_declined, booking.id, db.get_bind())
    return _to_out(booking, business)


@router.post("/businesses/{business_id}/bookings/{booking_id}/cancel", response_model=BookingOut)
def owner_cancel(
    booking_id: int,
    payload: CancelIn,
    background: BackgroundTasks,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BookingOut:
    if not _reason(payload.reason):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the customer a reason")
    settle(db, business_id=business.id)
    booking = _load_business_booking(db, business, booking_id)
    if booking.status != BookingStatus.confirmed.value:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only a confirmed booking can be cancelled. Decline a pending request instead.",
        )
    booking.status = BookingStatus.cancelled.value
    booking.cancelled_by = "owner"
    booking.cancel_reason = _reason(payload.reason)
    db.commit()
    db.refresh(booking)
    background.add_task(_notify_cancelled, booking.id, db.get_bind())
    return _to_out(booking, business)


def _close_out(db: Session, business: Business, booking_id: int, new_status: BookingStatus) -> BookingOut:
    settle(db, business_id=business.id)
    booking = _load_business_booking(db, business, booking_id)
    if booking.status != BookingStatus.confirmed.value:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {booking.status} booking cannot be closed out")
    if booking.confirmed_start and booking.confirmed_start > _now():
        raise HTTPException(status.HTTP_409_CONFLICT, "The appointment has not happened yet")
    booking.status = new_status.value
    db.commit()
    db.refresh(booking)
    return _to_out(booking, business)


@router.post("/businesses/{business_id}/bookings/{booking_id}/complete", response_model=BookingOut)
def complete_booking(
    booking_id: int, business: Business = Depends(require_owned_business), db: Session = Depends(get_db)
) -> BookingOut:
    return _close_out(db, business, booking_id, BookingStatus.completed)


@router.post("/businesses/{business_id}/bookings/{booking_id}/no-show", response_model=BookingOut)
def no_show_booking(
    booking_id: int, business: Business = Depends(require_owned_business), db: Session = Depends(get_db)
) -> BookingOut:
    return _close_out(db, business, booking_id, BookingStatus.no_show)


# ------------------------------------------------------------------ admin
def _admin_query(status_filter: str | None, business_id: int | None, q: str | None):
    query = select(Booking)
    if status_filter:
        query = query.where(Booking.status == status_filter)
    if business_id:
        query = query.where(Booking.business_id == business_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(
            or_(
                Booking.customer_name.ilike(like),
                Booking.customer_email.ilike(like),
                Booking.service_name.ilike(like),
                Booking.service_name_fr.ilike(like),
            )
        )
    return query


@router.get("/admin/bookings", response_model=AdminBookingPage)
def admin_bookings(
    status_filter: str | None = Query(default=None, alias="status"),
    business_id: int | None = Query(default=None, gt=0),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminBookingPage:
    settle(db)
    query = _admin_query(status_filter, business_id, q)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Booking.created_at.desc(), Booking.id.desc()).limit(limit).offset(offset)
    ).all()
    return AdminBookingPage(total=total, items=_outs(db, list(rows)))


def _csv_cell(value: object) -> str:
    """Neutralise spreadsheet formulas: a cell starting with = + - @ would run."""
    text_value = "" if value is None else str(value)
    return "'" + text_value if text_value[:1] in {"=", "+", "-", "@", "\t", "\r"} else text_value


@router.get("/admin/bookings.csv")
def admin_bookings_csv(
    status_filter: str | None = Query(default=None, alias="status"),
    business_id: int | None = Query(default=None, gt=0),
    q: str | None = Query(default=None, max_length=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Response:
    settle(db)
    rows = db.scalars(
        _admin_query(status_filter, business_id, q)
        .order_by(Booking.created_at.desc(), Booking.id.desc())
        .limit(20000)
    ).all()
    names = {
        b.id: b.name
        for b in db.scalars(select(Business).where(Business.id.in_({r.business_id for r in rows}))).all()
    } if rows else {}
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["id", "created_at_utc", "status", "business_id", "business", "service", "duration_min",
         "price", "customer", "email", "phone", "confirmed_start_utc", "confirmed_end_utc",
         "cancelled_by", "cancel_reason", "decline_message"]
    )
    for b in rows:
        writer.writerow(
            [
                b.id,
                b.created_at.isoformat(),
                b.status,
                b.business_id,
                _csv_cell(names.get(b.business_id)),
                _csv_cell(b.service_name),
                b.duration_minutes,
                "" if b.price_cents is None else f"{b.price_cents / 100:.2f}",
                _csv_cell(b.customer_name),
                _csv_cell(b.customer_email),
                _csv_cell(b.customer_phone),
                b.confirmed_start.isoformat() if b.confirmed_start else "",
                b.confirmed_end.isoformat() if b.confirmed_end else "",
                b.cancelled_by or "",
                _csv_cell(b.cancel_reason),
                _csv_cell(b.decline_message),
            ]
        )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="bookings.csv"'},
    )


# --------------------------------------------------------- notifications
# Run after the response, so each opens its own session (the request's is
# closed by then) and never raises into the request.
def _with_session(booking_id: int, bind, action) -> None:
    from sqlalchemy.orm import sessionmaker

    session = sessionmaker(bind=bind, future=True)()
    try:
        booking = session.get(Booking, booking_id)
        business = session.get(Business, booking.business_id) if booking else None
        if booking is not None and business is not None:
            _ = business.owner
            action(booking, business)
    except Exception:  # noqa: BLE001 - a lost email must not become an error
        import logging

        logging.getLogger(__name__).exception("booking notification failed for %s", booking_id)
    finally:
        session.close()


def _notify_requested(booking_id: int, bind) -> None:
    _with_session(booking_id, bind, booking_notify.request_received)


def _notify_confirmed(booking_id: int, bind) -> None:
    _with_session(booking_id, bind, booking_notify.confirmed)


def _notify_declined(booking_id: int, bind) -> None:
    _with_session(booking_id, bind, booking_notify.declined)


def _notify_cancelled(booking_id: int, bind) -> None:
    _with_session(booking_id, bind, booking_notify.cancelled)
