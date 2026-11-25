"""Sign up, sign in, refresh, sign out, "who am I?"."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response

from app.config import get_settings
from app.deps import DB, CurrentUser
from app.errors import AppError
from app.models import User
from app.ratelimit import release_login_attempt, reserve_login_attempt
from app.schemas import LoginIn, MembershipOut, MeOut, RegisterIn, TokenOut, UserOut
from app.security import create_access_token
from app.services import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "nf_refresh"
COOKIE_PATH = "/api/auth"  # the browser sends the refresh cookie to these endpoints only
CSRF_HEADER_VALUE = "nexusflow"


def _require_csrf_header(request: Request) -> None:
    # A custom header can't be added by a plain cross-site form or link, and adding it from
    # another site's script triggers a CORS preflight we don't allow. So a request carrying it
    # really comes from our own front end.
    if request.headers.get("x-requested-with") != CSRF_HEADER_VALUE:
        raise AppError(403, "Missing X-Requested-With header")


def _sign_in(response: Response, user: User, refresh_token: str) -> TokenOut:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=s.refresh_token_days * 24 * 3600,
        httponly=True,
        secure=s.cookie_secure,
        samesite=s.cookie_samesite,
        path=COOKIE_PATH,
    )
    access, expires_in = create_access_token(user.id)
    return TokenOut(access_token=access, expires_in=expires_in)


@router.post("/register", status_code=201)
def register(data: RegisterIn, response: Response, db: DB) -> TokenOut:
    user = auth.register(db, data)
    refresh = auth.issue_refresh_token(db, user.id)
    db.commit()
    return _sign_in(response, user, refresh)


@router.post("/login")
def login(data: LoginIn, request: Request, response: Response, db: DB) -> TokenOut:
    client = request.client.host if request.client else "unknown"
    reserve_login_attempt(client)
    user = auth.authenticate(db, data.email, data.password)
    if user is None:
        raise AppError(401, "Incorrect email or password")
    release_login_attempt(client)
    refresh = auth.issue_refresh_token(db, user.id)
    db.commit()
    return _sign_in(response, user, refresh)


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    db: DB,
    nf_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenOut:
    _require_csrf_header(request)
    try:
        user, new_refresh = auth.rotate_refresh_token(db, nf_refresh)
    except AppError:
        db.commit()  # keep a reuse-detection revocation
        raise
    db.commit()
    return _sign_in(response, user, new_refresh)


@router.post("/logout", status_code=204)
def logout(request: Request, db: DB, nf_refresh: Annotated[str | None, Cookie()] = None) -> Response:
    _require_csrf_header(request)
    auth.revoke_refresh_token(db, nf_refresh)
    db.commit()
    response = Response(status_code=204)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return response


@router.get("/me")
def me(user: CurrentUser, db: DB) -> MeOut:
    return MeOut(
        user=UserOut.model_validate(user),
        memberships=[MembershipOut.model_validate(m) for m in auth.memberships_of(db, user)],
    )
