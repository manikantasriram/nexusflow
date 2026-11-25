import pytest
from fastapi.testclient import TestClient

from tests.conftest import Actor, join, make_project


@pytest.fixture
def carol(client: TestClient, alice: Actor) -> Actor:
    """An admin in Alice's organization."""
    carol = Actor(client, "carol@acme.dev", "Carol's own", "Carol Admin")
    join(client, alice, carol, "admin")
    return carol


@pytest.fixture
def dave(client: TestClient, alice: Actor) -> Actor:
    """A plain member in Alice's organization."""
    dave = Actor(client, "dave@acme.dev", "Dave's own", "Dave Member")
    join(client, alice, dave, "member")
    return dave


def members_url(owner: Actor, user_id: int | None = None) -> str:
    base = f"/api/orgs/{owner.org_id}/members"
    return f"{base}/{user_id}" if user_id else base


def test_members_can_work_on_projects_but_not_delete_them(client: TestClient, alice: Actor, dave: Actor):
    project = make_project(client, dave, org_id=alice.org_id)
    url = f"/api/orgs/{alice.org_id}/projects/{project['id']}"
    assert client.patch(url, json={"name": "Renamed"}, headers=dave.headers).status_code == 200
    r = client.delete(url, headers=dave.headers)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"


def test_admins_can_delete_projects(client: TestClient, alice: Actor, carol: Actor):
    project = make_project(client, alice)
    url = f"/api/orgs/{alice.org_id}/projects/{project['id']}"
    assert client.delete(url, headers=carol.headers).status_code == 204
    assert client.get(url, headers=alice.headers).status_code == 404


def test_members_cannot_manage_people(client: TestClient, alice: Actor, carol: Actor, dave: Actor):
    erin = Actor(client, "erin@acme.dev", "Erin's own")
    assert (
        client.post(members_url(alice), json={"email": erin.email}, headers=dave.headers).status_code == 403
    )
    assert (
        client.patch(
            members_url(alice, carol.user_id), json={"role": "member"}, headers=dave.headers
        ).status_code
        == 403
    )
    assert client.delete(members_url(alice, carol.user_id), headers=dave.headers).status_code == 403


def test_admins_manage_members_but_cannot_grant_owner(
    client: TestClient, alice: Actor, carol: Actor, dave: Actor
):
    assert (
        client.patch(
            members_url(alice, dave.user_id), json={"role": "admin"}, headers=carol.headers
        ).status_code
        == 403
    )
    erin = Actor(client, "erin@acme.dev", "Erin's own")
    r = client.post(members_url(alice), json={"email": erin.email, "role": "owner"}, headers=carol.headers)
    assert r.status_code == 403
    r = client.post(members_url(alice), json={"email": erin.email, "role": "member"}, headers=carol.headers)
    assert r.status_code == 201
    assert client.delete(members_url(alice, erin.user_id), headers=carol.headers).status_code == 204


def test_admins_cannot_act_on_other_admins_or_owners(client: TestClient, alice: Actor, carol: Actor):
    frank = Actor(client, "frank@acme.dev", "Frank's own")
    join(client, alice, frank, "admin")
    assert (
        client.patch(
            members_url(alice, frank.user_id), json={"role": "member"}, headers=carol.headers
        ).status_code
        == 403
    )
    assert client.delete(members_url(alice, alice.user_id), headers=carol.headers).status_code == 403


def test_owner_can_appoint_another_owner(client: TestClient, alice: Actor, carol: Actor):
    r = client.patch(members_url(alice, carol.user_id), json={"role": "owner"}, headers=alice.headers)
    assert r.status_code == 200
    assert r.json()["role"] == "owner"


def test_the_last_owner_cannot_leave_or_step_down(client: TestClient, alice: Actor):
    r = client.delete(members_url(alice, alice.user_id), headers=alice.headers)
    assert r.status_code == 409
    r = client.patch(members_url(alice, alice.user_id), json={"role": "admin"}, headers=alice.headers)
    assert r.status_code == 409


def test_anyone_can_leave(client: TestClient, alice: Actor, dave: Actor):
    assert client.delete(members_url(alice, dave.user_id), headers=dave.headers).status_code == 204
    assert client.get(f"/api/orgs/{alice.org_id}", headers=dave.headers).status_code == 404


def test_adding_an_unknown_email_or_an_existing_member(client: TestClient, alice: Actor, dave: Actor):
    r = client.post(members_url(alice), json={"email": "nobody@nowhere.dev"}, headers=alice.headers)
    assert r.status_code == 404
    r = client.post(members_url(alice), json={"email": dave.email}, headers=alice.headers)
    assert r.status_code == 409


def test_member_list_shows_roles(client: TestClient, alice: Actor, carol: Actor, dave: Actor):
    members = client.get(members_url(alice), headers=dave.headers).json()
    assert {(m["user"]["email"], m["role"]) for m in members} == {
        (alice.email, "owner"),
        (carol.email, "admin"),
        (dave.email, "member"),
    }
