"""Business verification (KYC): submission by owners, decisions by admins.

Two audiences, one router, because they operate on the same row and splitting
them would make the state machine harder to follow than the authorisation is:

    owner   POST /businesses/{id}/verification   submit, or resubmit
    owner   GET  /businesses/{id}/verification   where it stands
    admin   GET  /admin/verifications/pending    the queue
    admin   GET  /admin/verifications/{id}       one submission, any status
    admin   GET  /admin/verifications/{id}/documents/{kind}
    admin   POST /admin/verifications/{id}/approve
    admin   POST /admin/verifications/{id}/reject

The paths span three prefixes (/uploads, /businesses, /admin), so this router
carries no prefix of its own and each route states its full path.

Verification is what a listing needs *in addition to* moderation approval
before it appears in public search. The two decisions are independent and both
must be positive - see search_businesses() in businesses.py.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import require_admin, require_owned_business
from app.models.business import Business
from app.models.user import User
from app.models.verification import BusinessVerification, VerificationStatus
from app.schemas.verification import (
    PendingVerificationItem,
    PresignResponse,
    VerificationApproval,
    VerificationDecision,
    VerificationOut,
    VerificationSubmit,
)
from app.services import storage
from app.services.mailer import send_email

router = APIRouter(tags=["verification"])


def _actor(user: User) -> str:
    return f"user:{user.id}"


def _load_verification(db: Session, verification_id: int) -> BusinessVerification:
    record = db.get(BusinessVerification, verification_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found"
        )
    return record


@router.get("/uploads/presign", response_model=PresignResponse)
def presign_document_upload(
    filename: str = Query(min_length=1, max_length=255),
    content_type: str = Query(min_length=3, max_length=128),
    purpose: str = Query(default="document", max_length=32),
    business: Business = Depends(require_owned_business),
) -> PresignResponse:
    """Get a short-lived URL to PUT one KYC document straight to storage.

    Owner-only, and scoped: `business_id` comes from the query string and goes
    through require_owned_business, so the key it hands back is under a
    business the caller actually owns. An open presign endpoint is a write
    primitive for anyone who finds it.

    The bytes never touch the API. A licence scan over a mobile connection
    would otherwise occupy a worker for the length of the upload.
    """
    if content_type not in storage.ALLOWED_DOCUMENT_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Upload a PDF or an image. Accepted types: "
                + ", ".join(sorted(storage.ALLOWED_DOCUMENT_CONTENT_TYPES))
            ),
        )

    # filename is used for nothing but the extension fallback and the audit
    # trail: the key is generated server-side, so a crafted name cannot
    # traverse out of the business's prefix.
    key = storage.document_key(business.id, purpose, content_type)

    try:
        upload_url, document_url, stub = storage.generate_document_upload_url(
            key, content_type
        )
    except storage.StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Document storage is unavailable: {exc}",
        ) from exc

    return PresignResponse(
        upload_url=upload_url,
        document_url=document_url,
        key=key,
        expires_in=storage.DOCUMENT_UPLOAD_EXPIRY_SECONDS,
        stub=stub,
    )


@router.post(
    "/businesses/{business_id}/verification",
    response_model=VerificationOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_verification(
    payload: VerificationSubmit,
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BusinessVerification:
    """Submit KYC for a listing, or resubmit after a rejection.

    Upsert rather than insert: one listing has one verification record, and a
    resubmission is a correction of the same claim, not a second claim. The
    row goes back to `pending` and the old rejection reason is cleared, so the
    queue shows what is being asked of a reviewer now rather than a mix of the
    current submission and the last decision.

    A verified record can be resubmitted too - contact details change - and
    that deliberately drops the listing out of public search until someone
    re-checks it. Silently keeping it visible on unreviewed details would make
    the verified badge meaningless.
    """
    record = db.scalar(
        select(BusinessVerification).where(
            BusinessVerification.business_id == business.id
        )
    )
    previous = record.status.value if record is not None else None

    if record is None:
        record = BusinessVerification(business_id=business.id)
        db.add(record)

    record.email = str(payload.email)
    record.mobile_number = payload.mobile_number
    record.license_number = payload.license_number
    record.license_document_url = payload.license_document_url
    record.gst_number = payload.gst_number
    record.gst_document_url = payload.gst_document_url
    record.status = VerificationStatus.pending
    record.rejection_reason = None
    record.reviewed_by = None
    record.reviewed_at = None
    record.submitted_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)

    log_audit(
        db,
        actor=f"user:{business.owner_id}" if business.owner_id else "user:unknown",
        action="verification.submitted",
        target_table="business_verifications",
        target_id=record.id,
        metadata={
            "business_id": business.id,
            "slug": business.slug,
            "from": previous,
            "has_license": record.license_document_url is not None,
            "has_gst": record.gst_document_url is not None,
        },
    )
    return record


@router.get("/businesses/{business_id}/verification", response_model=VerificationOut)
def get_verification(
    business: Business = Depends(require_owned_business),
    db: Session = Depends(get_db),
) -> BusinessVerification:
    """Where this listing's KYC stands. Owner or admin only.

    404 when nothing has been submitted, so a client can tell "not started"
    from "pending" without a sentinel status.
    """
    record = db.scalar(
        select(BusinessVerification).where(
            BusinessVerification.business_id == business.id
        )
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This listing has not submitted verification yet.",
        )
    return record


def _queue_item(
    record: BusinessVerification, business: Business, owner: User | None
) -> PendingVerificationItem:
    """One row of the queue, with enough context to judge without opening the listing."""
    return PendingVerificationItem(
        **VerificationOut.model_validate(record).model_dump(),
        business_name=business.name,
        business_slug=business.slug,
        business_city=business.city,
        business_status=business.status.value,
        owner_email=owner.email if owner is not None else None,
    )


def _queue_query():
    return (
        select(BusinessVerification, Business, User)
        .join(Business, Business.id == BusinessVerification.business_id)
        .outerjoin(User, User.id == Business.owner_id)
    )


@router.get(
    "/admin/verifications/pending", response_model=list[PendingVerificationItem]
)
def list_pending_verifications(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[PendingVerificationItem]:
    """The KYC queue: newest submission first.

    Newest first, like every other list in this API. The admin page tags each
    row with how long it has been waiting, so the oldest ones stay visible even
    though they sit at the bottom.
    """
    rows = db.execute(
        _queue_query()
        .where(BusinessVerification.status == VerificationStatus.pending)
        .order_by(BusinessVerification.submitted_at.desc(), BusinessVerification.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return [_queue_item(record, business, owner) for record, business, owner in rows]


@router.get(
    "/admin/verifications/{verification_id}", response_model=PendingVerificationItem
)
def get_verification_for_review(
    verification_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PendingVerificationItem:
    """One submission, whatever its status.

    Deliberately not restricted to pending: a reviewer who has just approved
    something is still looking at its page, and a detail view that 404s the
    moment you act on it is a detail view you cannot trust.
    """
    row = db.execute(
        _queue_query().where(BusinessVerification.id == verification_id)
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found"
        )
    record, business, owner = row
    return _queue_item(record, business, owner)


@router.get("/admin/verifications/{verification_id}/documents/{kind}")
def open_verification_document(
    verification_id: int,
    kind: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Redirect to a short-lived signed URL for one submitted document.

    The stored value is an s3:// address, which a browser cannot open, and the
    signature has to be minted at read time - one signed at upload would have
    expired long before a reviewer got here. So the link in the admin UI points
    at this route and this route signs on demand.

    Admin-only, and the signature is short-lived, so a URL that leaks into a
    log or a screenshot stops working rather than exposing a licence scan
    indefinitely.
    """
    record = _load_verification(db, verification_id)

    document_url = {
        "license": record.license_document_url,
        "gst": record.gst_document_url,
    }.get(kind)
    if kind not in {"license", "gst"}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document"
        )
    if document_url is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No document of that kind was submitted.",
        )

    signed = storage.generate_document_download_url(document_url)
    if signed is None:
        # A placeholder written in stub mode, or storage that is unreachable.
        # 409 rather than 404: the record exists and names a document, there is
        # just nothing to serve.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This document cannot be opened: object storage is not "
                "configured, so the reference was recorded but no file stored."
            ),
        )
    # 307 keeps the method, and the signed URL is single-use enough that a
    # cached 301 would be actively wrong.
    return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


def _decide(
    db: Session,
    record: BusinessVerification,
    moderator: User,
    new_status: VerificationStatus,
    reason: str | None,
    action: str,
) -> BusinessVerification:
    """Apply a decision, then record who made it."""
    previous = record.status
    record.status = new_status
    record.rejection_reason = reason
    record.reviewed_by = moderator.id
    record.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    # After the commit: log_audit commits the session itself, and a failed
    # audit write must never roll back the decision it describes.
    log_audit(
        db,
        actor=_actor(moderator),
        action=action,
        target_table="business_verifications",
        target_id=record.id,
        metadata={
            "business_id": record.business_id,
            "from": previous.value,
            "to": new_status.value,
            "reason": reason,
        },
    )
    return record


def _tell_owner_to_choose_a_plan(db: Session, record: BusinessVerification) -> None:
    """Email the owner that they are verified and can now choose a plan.

    Payment comes after verification (app/api/v1/billing.py), so this is the
    moment they learn it is open. After the commit and best effort: the
    approval stands whether or not the mail server is up.
    """
    business = db.get(Business, record.business_id)
    owner = db.get(User, business.owner_id) if business and business.owner_id else None
    if business is None or owner is None:
        return
    link = f"{get_settings().web_base_url}/dashboard/{business.id}/billing"
    send_email(
        to=owner.email,
        subject=f"{business.name} is verified - choose your plan",
        body="\n".join(
            [
                f"Hi {owner.name},",
                "",
                f"Good news: {business.name} has been verified.",
                "You can now choose a plan. You are not charged until you do.",
                "",
                f"Choose your plan: {link}",
                "",
                "The justforyou team",
            ]
        ),
    )


@router.post(
    "/admin/verifications/{verification_id}/approve", response_model=VerificationOut
)
def approve_verification(
    verification_id: int,
    payload: VerificationApproval | None = None,
    moderator: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BusinessVerification:
    """Mark a business verified.

    This is the second of the two gates on public visibility: an approved
    listing whose KYC is verified appears in search from the next request, with
    no other step and no subscription required.
    """
    record = _load_verification(db, verification_id)
    decided = _decide(
        db,
        record,
        moderator,
        VerificationStatus.verified,
        payload.note if payload is not None else None,
        "verification.approved",
    )
    _tell_owner_to_choose_a_plan(db, decided)
    return decided


@router.post(
    "/admin/verifications/{verification_id}/reject", response_model=VerificationOut
)
def reject_verification(
    verification_id: int,
    payload: VerificationDecision,
    moderator: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BusinessVerification:
    """Reject a KYC submission, with a reason the owner will read.

    The reason is required by the schema. A rejection the owner cannot act on
    wastes both sides' time: they resubmit the same documents and it is
    rejected again.
    """
    record = _load_verification(db, verification_id)
    return _decide(
        db,
        record,
        moderator,
        VerificationStatus.rejected,
        payload.reason.strip(),
        "verification.rejected",
    )
