"""Outgoing email. Only the "console" backend exists until a real provider is approved (CLAUDE.md)."""

import logging

from app.config import Settings

logger = logging.getLogger("app.email")


def send_password_reset(settings: Settings, to: str, link: str) -> None:
    if settings.email_backend != "console":
        raise RuntimeError(f"Email backend '{settings.email_backend}' is not configured.")
    # Development only: the link is a one-time, short-lived credential for a local account.
    logger.warning("Password reset for %s: %s", to, link)
