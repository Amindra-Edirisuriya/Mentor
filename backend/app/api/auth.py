"""Account endpoints: register, login, logout, profile, password change/reset, delete account."""

import logging
import shutil
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.email import send_password_reset
from app.models import PasswordResetToken, Project, User, UserSession
from app.schemas import UserOut
from app.security.auth import (
    SESSION_COOKIE,
    as_utc,
    clear_cookie,
    end_all_sessions,
    get_current_user,
    hash_password,
    hash_token,
    new_token,
    normalise_email,
    now,
    password_problem,
    start_session,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(max_length=256)


class ForgotIn(BaseModel):
    email: str = Field(max_length=254)


class ResetIn(BaseModel):
    token: str = Field(max_length=128)
    new_password: str = Field(max_length=256)


class DeleteIn(BaseModel):
    password: str = Field(max_length=256)


def _bad(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


def _email_or_400(raw: str) -> str:
    try:
        return normalise_email(raw)
    except ValueError as exc:
        raise _bad(str(exc)) from exc


def _find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserOut)
def register(
    body: RegisterIn, response: Response, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> User:
    email = _email_or_400(body.email)
    name = body.name.strip()
    if not name:
        raise _bad("Enter your name.")
    if problem := password_problem(body.password, email):
        raise _bad(problem)
    if _find_user(db, email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Try signing in.")
    user = User(email=email, name=name, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    start_session(db, user, response, settings)
    db.commit()
    return user


@router.post("/login", response_model=UserOut)
def login(
    body: LoginIn, response: Response, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> User:
    try:
        user = _find_user(db, normalise_email(body.email))
    except ValueError:
        user = None
    # Same message (and similar timing) whether the email or the password is wrong.
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    start_session(db, user, response, settings)
    db.commit()
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> Response:
    if token := request.cookies.get(SESSION_COOKIE):
        if (session := db.get(UserSession, hash_token(token))) is not None:
            db.delete(session)
            db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_cookie(response, settings)
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    name = body.name.strip()
    if not name:
        raise _bad("Enter your name.")
    user.name = name
    db.commit()
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordIn,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    if not verify_password(user.password_hash, body.current_password):
        raise _bad("Your current password is incorrect.")
    if problem := password_problem(body.new_password, user.email):
        raise _bad(problem)
    user.password_hash = hash_password(body.new_password)
    end_all_sessions(db, user.id)  # sign out every other device...
    start_session(db, user, response, settings)  # ...but keep this one signed in
    db.commit()


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    body: ForgotIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> dict[str, str]:
    message = {"detail": "If an account exists for that email, we've sent a reset link."}
    try:
        user = _find_user(db, normalise_email(body.email))
    except ValueError:
        return message
    if user is None:
        return message  # don't reveal which emails have accounts
    db.execute(  # only the newest link works
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now())
    )
    token, token_hash = new_token()
    expires = now() + timedelta(minutes=settings.password_reset_minutes)
    db.add(PasswordResetToken(token_hash=token_hash, user_id=user.id, expires_at=expires))
    db.commit()
    send_password_reset(settings, user.email, f"{settings.app_url.rstrip('/')}/reset-password?token={token}")
    return message


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(body: ResetIn, db: Session = Depends(get_db)) -> None:
    record = db.get(PasswordResetToken, hash_token(body.token))
    if record is None or record.used_at is not None or as_utc(record.expires_at) <= now():
        raise _bad("This reset link is invalid or has expired. Request a new one.")
    user = db.get(User, record.user_id)
    assert user is not None  # FK cascade removes tokens with their user
    if problem := password_problem(body.new_password, user.email):
        raise _bad(problem)
    user.password_hash = hash_password(body.new_password)
    record.used_at = now()
    end_all_sessions(db, user.id)  # whoever knew the old password is signed out
    db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    if not verify_password(user.password_hash, body.password):
        raise _bad("Your password is incorrect.")
    projects = list(db.scalars(select(Project).where(Project.owner_id == user.id)))
    for project in projects:
        db.delete(project)
    end_all_sessions(db, user.id)
    db.delete(user)
    db.commit()
    for project in projects:
        shutil.rmtree(settings.storage_dir / "projects" / str(project.id), ignore_errors=True)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_cookie(response, settings)
    return response
