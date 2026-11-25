"""Test setup: every test gets a fresh in-memory SQLite database and an empty cache, so tests
are fast, never touch real data and can run in any order.

Set TEST_DATABASE_URL to run the same tests against PostgreSQL (CI does this).
"""

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.cache import MemoryCache, RedisCache, get_cache
from app.db import Base, get_db, make_engine
from app.main import app

PASSWORD = "pass-word-123"


def _engine() -> Engine:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return make_engine(url)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _fk_on(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    return engine


@pytest.fixture(autouse=True)
def _empty_cache() -> Iterator[None]:
    """Rate-limit counts and cached stats from one test must not leak into the next."""
    cache = get_cache()
    if isinstance(cache, MemoryCache | RedisCache):
        cache.clear()
    yield


@pytest.fixture
def db() -> Iterator[Session]:
    engine = _engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class Actor:
    """A signed-up user: their auth header and the id of the organization they own."""

    def __init__(self, client: TestClient, email: str, org_name: str, full_name: str = "Test User"):
        r = client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": PASSWORD,
                "full_name": full_name,
                "organization_name": org_name,
            },
        )
        assert r.status_code == 201, r.text
        self.headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        me = client.get("/api/auth/me", headers=self.headers).json()
        self.user_id: int = me["user"]["id"]
        self.org_id: int = me["memberships"][0]["organization"]["id"]
        self.email = email


@pytest.fixture
def alice(client: TestClient) -> Actor:
    return Actor(client, "alice@acme.dev", "Acme", "Alice Owner")


@pytest.fixture
def bob(client: TestClient) -> Actor:
    """Owner of a *different* organization, used to prove tenant isolation."""
    return Actor(client, "bob@globex.dev", "Globex", "Bob Outsider")


def join(client: TestClient, owner: Actor, member: Actor, role: str = "member") -> None:
    r = client.post(
        f"/api/orgs/{owner.org_id}/members", json={"email": member.email, "role": role}, headers=owner.headers
    )
    assert r.status_code == 201, r.text


def make_project(client: TestClient, actor: Actor, key: str = "WEB", org_id: int | None = None) -> dict:
    r = client.post(
        f"/api/orgs/{org_id or actor.org_id}/projects",
        json={"name": f"Project {key}", "key": key},
        headers=actor.headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def make_task(client: TestClient, actor: Actor, project_id: int, org_id: int | None = None, **fields) -> dict:
    body = {"title": "A task", **fields}
    r = client.post(
        f"/api/orgs/{org_id or actor.org_id}/projects/{project_id}/tasks", json=body, headers=actor.headers
    )
    assert r.status_code == 201, r.text
    return r.json()
