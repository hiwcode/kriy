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
import socket
from email.message import EmailMessage

import asyncpg
from google.adk.tools import FunctionTool

from app.repositories import user_config_repo

logger = logging.getLogger(__name__)

_GMAIL_SMTP_HOST = "smtp.gmail.com"
_GMAIL_SMTP_PORT = 587


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

    Uses port 587 + STARTTLS (matching nodemailer's default config).
    Forces IPv4 to avoid ENETUNREACH on hosts without IPv6 (e.g. Render).
    """
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body or "")
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    # Resolve to IPv4 explicitly to avoid IPv6 ENETUNREACH on cloud hosts.
    ipv4_addr = socket.getaddrinfo(
        _GMAIL_SMTP_HOST, _GMAIL_SMTP_PORT, socket.AF_INET
    )[0][4][0]

    with smtplib.SMTP(ipv4_addr, _GMAIL_SMTP_PORT, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
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
