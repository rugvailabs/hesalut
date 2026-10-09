"""Outbound delivery of solutions to the submitter."""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.config import get_settings
from app.models.consent import Consent, ConsentType
from app.models.user import User
from app.schemas.service_results import NotificationResult

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 30

#: Which consent authorises which channel. This mapping is the CASL gate.
CONSENT_FOR_CHANNEL: dict[str, ConsentType] = {
    "email": ConsentType.send_email,
    "sms": ConsentType.send_sms,
}


@dataclass(frozen=True)
class SolutionPayload:
    """What the customer is being told, independent of channel."""

    submission_id: int
    solution_text: str
    provider_name: str | None = None
    provider_contact: str | None = None
    category: str | None = None


def active_consent(db: Session, user_id: int, channel: str) -> Consent | None:
    """The unrevoked consent authorising `channel`, or None."""
    consent_type = CONSENT_FOR_CHANNEL.get(channel)
    if consent_type is None:
        return None
    return db.scalar(
        select(Consent).where(
            Consent.user_id == user_id,
            Consent.consent_type == consent_type,
            Consent.revoked_at.is_(None),
        )
    )


def channel_for(user: User) -> Literal["email", "sms"]:
    """Map the profile preference onto a channel we can actually send on.

    'phone' means "call me", which is a human action rather than an automated
    one, so it falls back to email for the written record.
    """
    return "sms" if user.preferred_contact_method.value == "sms" else "email"


def _render_email(user: User, payload: SolutionPayload) -> EmailMessage:
    settings = get_settings()
    msg = EmailMessage()
    msg["Subject"] = "Your hesalut request - we found a match"
    msg["From"] = settings.mail_from
    msg["To"] = user.email

    lines = [f"Hi {user.name},", ""]
    if payload.provider_name:
        lines += [
            f"We matched your request to {payload.provider_name}.",
            "",
            f"Contact: {payload.provider_contact}",
        ]
    else:
        lines.append("Here is what we found for your request:")
    lines += ["", payload.solution_text, ""]
    lines += [
        f"Reference: submission #{payload.submission_id}",
        "",
        # CASL requires sender identification and a working unsubscribe in
        # every commercial message.
        "---",
        "hesalut, Toronto, Ontario, Canada",
        "You are receiving this because you asked us to contact you.",
        "To stop receiving these, withdraw your consent in your profile:",
        "http://localhost:3000/profile",
    ]
    msg.set_content("\n".join(lines))
    return msg


def _send_email(user: User, payload: SolutionPayload) -> None:
    settings = get_settings()
    msg = _render_email(user, payload)

    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
    ) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def send_solution(
    db: Session,
    submission_id: int,
    channel: Literal["email", "sms"],
    *,
    user: User,
    payload: SolutionPayload,
) -> NotificationResult:
    """Deliver the matched solution to the submission's owner.

    The consent check is a hard stop, not a warning: without an active,
    unrevoked consent for this channel, nothing is sent. Every attempt leaves
    an audit row behind whether it succeeded, failed, or was suppressed.

    Returns success=False with `error` populated rather than raising, so the
    caller can route the submission to human review instead of retrying
    forever on a hard bounce.
    """
    recipient = user.email if channel == "email" else (user.phone or "")

    consent = active_consent(db, user.id, channel)
    if consent is None:
        logger.warning(
            "notify: no active %s consent for user %s - suppressing send",
            channel,
            user.id,
        )
        log_audit(
            db,
            actor="system",
            action="message.suppressed_no_consent",
            target_table="submissions",
            target_id=submission_id,
            metadata={"channel": channel, "recipient": recipient},
        )
        return NotificationResult(
            success=False,
            channel=channel,
            recipient=recipient,
            error=f"no active {channel} consent",
        )

    if not recipient:
        log_audit(
            db,
            actor="system",
            action="message.failed",
            target_table="submissions",
            target_id=submission_id,
            metadata={"channel": channel, "error": "no recipient address on file"},
        )
        return NotificationResult(
            success=False,
            channel=channel,
            recipient="",
            error="no recipient address on file",
        )

    error: str | None = None
    if channel == "email":
        try:
            _send_email(user, payload)
        except (smtplib.SMTPException, OSError) as exc:
            error = f"{type(exc).__name__}: {exc}"
            logger.error("notify: email to %s failed: %s", recipient, error)
    else:
        # STUB: no SMS gateway is wired up yet. The consent check, the
        # messages_sent row and the audit trail are all real, so switching
        # this branch to Twilio later touches only these few lines.
        logger.warning(
            "notify: SMS requested for submission %s but no gateway is "
            "configured; recording the attempt without sending",
            submission_id,
        )
        error = "no SMS gateway configured"

    success = error is None
    log_audit(
        db,
        actor="system",
        action="message.sent" if success else "message.failed",
        target_table="messages_sent",
        target_id=submission_id,
        metadata={
            "channel": channel,
            "recipient": recipient,
            "consent_id": consent.id,
            "provider_name": payload.provider_name,
            "error": error,
        },
    )
    return NotificationResult(
        success=success, channel=channel, recipient=recipient, error=error
    )
