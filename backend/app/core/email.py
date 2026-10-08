import logging

import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, text: str) -> None:
    """Send a plain-text email with Resend.

    It runs as a background task after the response is sent, so a failure is
    logged instead of raised: an email problem must not fail the request.
    """
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY is not set, so the email to %s was not sent", to)
        return

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send({"from": settings.email_from, "to": [to], "subject": subject, "text": text})
    except Exception:
        logger.exception("Could not send the email to %s", to)
