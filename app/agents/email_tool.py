"""Email tool for agents — send email via the user's Gmail account.

Uses Gmail SMTP with an App Password (configured per user under Config → Email).
The password is stored encrypted at rest and only decrypted at send time.

Note: this requires a Google App Password (not the account password) with 2-Step
Verification enabled. OAuth-based sending can replace this later without changing
the tool's interface.
"""

from __future__ import annotations

import asyncio
import json
import logging
import smtplib
from email.message import EmailMessage

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import user_config_repo

logger = logging.getLogger(__name__)

_GMAIL_SMTP_HOST = "smtp.gmail.com"
_GMAIL_SMTP_SSL_PORT = 465
_GMAIL_SMTP_STARTTLS_PORT = 587


def _send_via_gmail(
    *,
    sender: str,
    app_password: str,
    to: list[str],
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    """Blocking SMTP send (run in a thread). Raises on failure.

    `body` is the plain-text part (always set, used as the fallback). If
    `html_body` is given, an HTML alternative is attached so clients that render
    HTML show the rich version.

    Tries SSL on port 465 first, falls back to STARTTLS on port 587 if
    the network blocks 465 (common on hosted platforms like Render).
    """
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body or "")
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP_SSL(_GMAIL_SMTP_HOST, _GMAIL_SMTP_SSL_PORT, timeout=30) as smtp:
            smtp.login(sender, app_password)
            smtp.send_message(msg)
    except OSError:
        # Port 465 blocked — try 587 with STARTTLS.
        with smtplib.SMTP(_GMAIL_SMTP_HOST, _GMAIL_SMTP_STARTTLS_PORT, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(sender, app_password)
            smtp.send_message(msg)


def make_email_tools(pool: asyncpg.Pool, user_id: int | None) -> list[FunctionTool]:
    """Create the send_email tool bound to the given user's Gmail config."""

    async def send_email(
        to: str, subject: str, body: str, html_body: str = ""
    ) -> str:
        """Send an email from the user's configured Gmail account.

        Requires the user to have set their Gmail address + App Password under
        Config → Email. Use this to email reports, summaries, or notifications.

        Args:
            to: Recipient email address. Separate multiple recipients with commas.
            subject: The email subject line.
            body: The plain-text body (always included; used as the fallback).
            html_body: Optional HTML version of the email. When provided, the email
                is sent as multipart so HTML-capable clients render this, while
                `body` remains the plain-text fallback. Pass full HTML markup, e.g.
                "<h1>Report</h1><p>...</p>".
        """
        if user_id is None:
            return json.dumps({"error": "no user context — cannot send email"})

        config = await user_config_repo.get_config(pool, user_id)
        sender = (config or {}).get("gmail_address")
        app_password = (config or {}).get("gmail_app_password")
        if not sender or not app_password:
            return json.dumps(
                {
                    "error": "Gmail is not configured. Add your Gmail address and "
                    "App Password under Config → Email.",
                }
            )

        recipients = [addr.strip() for addr in to.split(",") if addr.strip()]
        if not recipients:
            return json.dumps({"error": "no valid recipient address provided"})

        try:
            await asyncio.to_thread(
                _send_via_gmail,
                sender=sender,
                app_password=app_password,
                to=recipients,
                subject=subject,
                body=body,
                html_body=html_body or None,
            )
            return json.dumps({"success": True, "to": recipients, "subject": subject})
        except smtplib.SMTPAuthenticationError:
            return json.dumps(
                {
                    "error": "Gmail authentication failed. Check your App Password "
                    "(not your account password) and that 2-Step Verification is on.",
                }
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("send_email failed for user %s: %s", user_id, e)
            return json.dumps({"error": f"failed to send email: {e}"})

    return [FunctionTool(func=send_email)]
