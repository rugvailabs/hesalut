"""Outbound email, best effort.

One place that knows how to reach the SMTP server (MailHog locally, where
every message can be read at http://localhost:8025). Callers send after their
own work is committed and carry on if sending fails: a welcome email that did
not go out is a log line, never a registration that did not happen.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 15


def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    reply_to: str | None = None,
    attachments: list[tuple[str, str, bytes]] | None = None,
) -> bool:
    """Send a plain-text email. Returns False, and logs, if it could not.

    `attachments` are (filename, "type/subtype", content) triples - used for
    the calendar file on a booking confirmation.
    """
    settings = get_settings()

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.mail_from
    message["To"] = to
    if reply_to:
        message["Reply-To"] = reply_to
    message.set_content(body)
    for filename, content_type, data in attachments or []:
        maintype, _, subtype = content_type.partition("/")
        message.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)

    try:
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        ) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except Exception:
        logger.exception("Could not send email %r to %s", subject, to)
        return False
    return True
