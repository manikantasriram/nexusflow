"""Passwords and tokens.

Passwords are never stored, only an Argon2 hash. A login returns two tokens:

- an **access token** (a JWT, valid 15 minutes) that the browser keeps in memory and sends as
  `Authorization: Bearer ...` on every request;
- a **refresh token** (a random string, valid 7 days) in an httpOnly cookie. JavaScript can't
  read it, so an XSS bug can't steal it. It's used only to get a new access token.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

ALGORITHM = "HS256"
# Hashing is deliberately slow, so refuse absurdly long passwords before hashing them.
MAX_PASSWORD_LENGTH = 128
_hasher = PasswordHash.recommended()  # Argon2id
# Checking against this when the email is unknown makes a wrong email take as long as a wrong
# password, so response times don't reveal which emails have accounts.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password_or_dummy(password: str, hashed: str | None) -> bool:
    """Checks a password; still does the slow hash check when there is no such user."""
    if len(password) > MAX_PASSWORD_LENGTH:
        return False
    if hashed is None:
        _hasher.verify(password, _DUMMY_HASH)
        return False
    return _hasher.verify(password, hashed)


def create_access_token(user_id: int) -> tuple[str, int]:
    """Returns the token and how many seconds it is valid for."""
    settings = get_settings()
    now = datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_minutes)
    claims = {"sub": str(user_id), "type": "access", "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM), int(lifetime.total_seconds())


def decode_access_token(token: str) -> int:
    """Returns the user id. Raises jwt.PyJWTError if the token is forged, malformed or expired."""
    claims = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    if claims.get("type") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return int(claims["sub"])


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    # A plain SHA-256 is enough here: the token is 256 random bits, so it can't be guessed.
    return hashlib.sha256(token.encode()).hexdigest()
