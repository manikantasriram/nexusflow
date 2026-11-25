"""Sign-up, sign-in and refresh-token rotation."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError
from app.models import Membership, RefreshToken, User
from app.schemas import RegisterIn
from app.security import hash_password, hash_refresh_token, new_refresh_token, verify_password_or_dummy
from app.services.orgs import create_organization

# Two tabs can refresh at the same moment with the same cookie. The first wins and the browser
# stores its new cookie; the second arrives with the now-revoked one. Inside this window we treat
# that as a race, not theft, and simply refuse it (the tab retries with the new cookie).
REUSE_GRACE_SECONDS = 10


def _aware(dt: datetime) -> datetime:
    # SQLite hands datetimes back without a timezone; PostgreSQL keeps it. Treat naive as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def register(db: Session, data: RegisterIn) -> User:
    email = data.email.lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError(409, "An account with that email already exists")
    user = User(email=email, full_name=data.full_name, hashed_password=hash_password(data.password))
    db.add(user)
    db.flush()
    create_organization(db, user, data.organization_name)
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.lower()))
    ok = verify_password_or_dummy(password, user.hashed_password if user else None)
    return user if ok and user and user.is_active else None


def issue_refresh_token(db: Session, user_id: int, family_id: str | None = None) -> str:
    raw = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(raw),
            family_id=family_id or str(uuid.uuid4()),
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days),
        )
    )
    return raw


def _revoke_family(db: Session, family_id: str) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def rotate_refresh_token(db: Session, raw: str | None) -> tuple[User, str]:
    """Swaps a valid refresh token for a new one. Raises 401 if it can't be used.

    Call db.commit() afterwards, also when this raises: a detected reuse revokes the family.
    """
    expired = AppError(401, "Your session has ended. Please sign in again.")
    if not raw:
        raise expired
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw)))
    if token is None:
        raise expired
    now = datetime.now(UTC)
    if token.revoked_at is not None:
        if (now - _aware(token.revoked_at)).total_seconds() > REUSE_GRACE_SECONDS:
            _revoke_family(db, token.family_id)  # an old token came back: assume it was stolen
        raise expired
    if _aware(token.expires_at) <= now:
        raise expired
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise expired
    token.revoked_at = now
    return user, issue_refresh_token(db, user.id, token.family_id)


def revoke_refresh_token(db: Session, raw: str | None) -> None:
    """Sign-out: ends this login (its whole token family) on the server."""
    if not raw:
        return
    family = db.scalar(
        select(RefreshToken.family_id).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )
    if family:
        _revoke_family(db, family)


def memberships_of(db: Session, user: User) -> list[Membership]:
    return list(
        db.scalars(
            select(Membership)
            .where(Membership.user_id == user.id)
            .order_by(Membership.created_at, Membership.id)
        )
    )
