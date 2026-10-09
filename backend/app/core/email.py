import logging
import smtplib
from email.message import EmailMessage
from email.utils import parseaddr

import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send an email and return whether the provider accepted it.

    SMTP (for example Gmail with an app password) is used when SMTP_HOST is set,
    otherwise Resend. A failure is logged instead of raised: an email problem must
    not fail the request. Callers that need to know (invitations) check the result.
    """
    settings = get_settings()
    try:
        if settings.smtp_host:
            _send_smtp(to, subject, text, html)
        elif settings.resend_api_key:
            resend.api_key = settings.resend_api_key
            payload = {"from": settings.email_from, "to": [to], "subject": subject, "text": text}
            if html:
                payload["html"] = html
            resend.Emails.send(payload)
        else:
            logger.warning("No email provider is configured, so the email to %s was not sent", to)
            return False
    except Exception:
        logger.exception("Could not send the email to %s", to)
        return False
    return True


def _send_smtp(to: str, subject: str, text: str, html: str | None) -> None:
    settings = get_settings()
    message = EmailMessage()
    # Gmail only sends as the signed-in account, so its address must be the From address.
    name, address = parseaddr(settings.email_from)
    message["From"] = f"{name} <{settings.smtp_username or address}>" if name else (settings.smtp_username or address)
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")

    if settings.smtp_port == 465:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        server.starttls()
    with server:
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
