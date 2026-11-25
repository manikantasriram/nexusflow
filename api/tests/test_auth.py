from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.routers.auth import REFRESH_COOKIE
from app.services import auth as auth_service
from tests.conftest import PASSWORD, Actor

CSRF = {"X-Requested-With": "nexusflow"}


def use_cookie(client: TestClient, token: str | None) -> None:
    """Replace the browser's refresh cookie, as an attacker replaying a copied token would."""
    client.cookies.clear()
    client.cookies.set(REFRESH_COOKIE, token or "")


def login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_register_makes_you_owner_of_a_new_organization(client: TestClient, alice: Actor):
    me = client.get("/api/auth/me", headers=alice.headers).json()
    assert me["user"]["email"] == "alice@acme.dev"
    assert me["memberships"] == [
        {"organization": {"id": alice.org_id, "name": "Acme", "slug": "acme"}, "role": "owner"}
    ]


def test_register_twice_with_one_email_is_a_conflict(client: TestClient, alice: Actor):
    r = client.post(
        "/api/auth/register",
        json={
            "email": "ALICE@acme.dev",
            "password": PASSWORD,
            "full_name": "Again",
            "organization_name": "Org",
        },
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "conflict"


def test_validation_errors_name_the_field(client: TestClient):
    r = client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "password": "short", "full_name": "X Y", "organization_name": "Org"},
    )
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "validation_error"
    assert set(error["fields"]) == {"email", "password"}


def test_login_with_a_wrong_password_is_refused(client: TestClient, alice: Actor):
    r = login(client, alice.email, "wrong-password")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "unauthorized", "message": "Incorrect email or password"}}


def test_login_sets_an_httponly_refresh_cookie(client: TestClient, alice: Actor):
    r = login(client, alice.email)
    assert r.status_code == 200
    assert r.json()["token_type"] == "bearer"
    cookie = r.headers["set-cookie"]
    assert f"{REFRESH_COOKIE}=" in cookie
    assert "HttpOnly" in cookie
    assert "Path=/api/auth" in cookie


def test_too_many_failed_logins_answers_429(client: TestClient, alice: Actor):
    limit = get_settings().login_attempts_per_minute
    for _ in range(limit):
        assert login(client, alice.email, "wrong-password").status_code == 401
    r = login(client, alice.email)  # even the right password is refused now
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_successful_logins_do_not_count_against_the_limit(client: TestClient, alice: Actor):
    for _ in range(get_settings().login_attempts_per_minute + 2):
        assert login(client, alice.email).status_code == 200


def test_refresh_rotates_the_token(client: TestClient, alice: Actor):
    login(client, alice.email)
    first = client.cookies.get(REFRESH_COOKIE)
    r = client.post("/api/auth/refresh", headers=CSRF)
    assert r.status_code == 200
    assert (
        client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}
        ).status_code
        == 200
    )
    assert client.cookies.get(REFRESH_COOKIE) != first


def test_refresh_needs_the_csrf_header(client: TestClient, alice: Actor):
    login(client, alice.email)
    assert client.post("/api/auth/refresh").status_code == 403


def test_reusing_an_old_refresh_token_ends_the_whole_login(
    client: TestClient, alice: Actor, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(auth_service, "REUSE_GRACE_SECONDS", -1)  # no grace: any reuse is theft
    login(client, alice.email)
    stolen = client.cookies.get(REFRESH_COOKIE)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 200
    current = client.cookies.get(REFRESH_COOKIE)

    use_cookie(client, stolen)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 401

    # The legitimate user's newer token was revoked too.
    use_cookie(client, current)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 401


def test_a_parallel_refresh_inside_the_grace_window_does_not_end_the_login(client: TestClient, alice: Actor):
    login(client, alice.email)
    old = client.cookies.get(REFRESH_COOKIE)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 200
    current = client.cookies.get(REFRESH_COOKIE)

    use_cookie(client, old)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 401
    use_cookie(client, current)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 200


def test_logout_revokes_the_refresh_token(client: TestClient, alice: Actor):
    login(client, alice.email)
    token = client.cookies.get(REFRESH_COOKIE)
    assert client.post("/api/auth/logout", headers=CSRF).status_code == 204
    use_cookie(client, token)
    assert client.post("/api/auth/refresh", headers=CSRF).status_code == 401


def test_expired_or_forged_access_tokens_are_refused(client: TestClient, alice: Actor):
    now = datetime.now(UTC)
    expired = jwt.encode(
        {
            "sub": str(alice.user_id),
            "type": "access",
            "iat": now - timedelta(hours=1),
            "exp": now - timedelta(minutes=1),
        },
        get_settings().jwt_secret,
        algorithm="HS256",
    )
    forged = jwt.encode(
        {"sub": str(alice.user_id), "type": "access", "exp": now + timedelta(hours=1)},
        "some-other-secret-that-is-long-enough-00000",
        algorithm="HS256",
    )
    for token in (expired, forged):
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401
    assert client.get("/api/auth/me").status_code == 401
