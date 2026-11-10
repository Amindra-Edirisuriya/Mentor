"""Password hashing, session tokens and the current-user dependency.

Sessions are opaque random tokens held in an httpOnly cookie; the database stores only their
SHA-256 hash. See docs/adr/0004-accounts-and-cookie-sessions.md.
"""

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_db
from app.models import User, UserSession

SESSION_COOKIE = "vife_session"
MIN_PASSWORD = 8
MAX_PASSWORD = 128
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_hasher = PasswordHasher()  # Argon2id with the library's current recommended parameters
# Verified against when the email is unknown, so login takes the same time either way.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def normalise_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not _EMAIL.match(email):
        raise ValueError("Enter a valid email address.")
    return email


def password_problem(password: str, email: str = "") -> str | None:
    """Return why a new password is unacceptable, or None."""
    if len(password) < MIN_PASSWORD:
        return f"Password must be at least {MIN_PASSWORD} characters."
    if len(password) > MAX_PASSWORD:
        return f"Password must be at most {MAX_PASSWORD} characters."
    if password.isalpha() or password.isdigit():
        return "Use a mix of letters and numbers or symbols."
    if email and password.lower() == email.lower():
        return "Password must not be your email address."
    return None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> tuple[str, str]:
    """A fresh (token, sha256-hash) pair. The token goes to the client, the hash to the DB."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def now() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    # SQLite (tests) drops tzinfo; Postgres keeps it.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def start_session(db: Session, user: User, response: Response, settings: Settings) -> None:
    token, token_hash = new_token()
    expires = now() + timedelta(days=settings.session_days)
    db.add(UserSession(token_hash=token_hash, user_id=user.id, expires_at=expires))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def end_all_sessions(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(UserSession).where(UserSession.user_id == user_id))


def clear_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: the logged-in user, or 401."""
    token = request.cookies.get(SESSION_COOKIE)
    session = db.get(UserSession, hash_token(token)) if token else None
    if session is None or as_utc(session.expires_at) <= now():
        if session is not None:
            db.delete(session)
            db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in to continue.")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in to continue.")
    return user
