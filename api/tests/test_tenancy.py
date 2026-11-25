"""The most important guarantee: a user in organization A can never see or change data in B.

Every case answers 404, not 403, so an outsider can't even confirm that the id exists.
"""

import io

from fastapi.testclient import TestClient

from tests.conftest import Actor, make_project, make_task


def test_outsider_cannot_read_anything_in_another_organization(client: TestClient, alice: Actor, bob: Actor):
    project = make_project(client, alice)
    task = make_task(client, alice, project["id"])
    doc = client.post(
        f"/api/orgs/{alice.org_id}/projects/{project['id']}/documents",
        files={
            "file": ("notes.txt", io.BytesIO(b"Secret roadmap for the launch of the product."), "text/plain")
        },
        headers=alice.headers,
    ).json()

    a = alice.org_id
    for path in (
        f"/api/orgs/{a}",
        f"/api/orgs/{a}/members",
        f"/api/orgs/{a}/stats",
        f"/api/orgs/{a}/projects",
        f"/api/orgs/{a}/projects/{project['id']}",
        f"/api/orgs/{a}/projects/{project['id']}/tasks",
        f"/api/orgs/{a}/tasks/{task['id']}",
        f"/api/orgs/{a}/tasks/mine",
        f"/api/orgs/{a}/documents/{doc['id']}",
    ):
        r = client.get(path, headers=bob.headers)
        assert r.status_code == 404, path
        assert r.json()["error"]["code"] == "not_found"


def test_outsider_cannot_reach_foreign_rows_through_their_own_organization(
    client: TestClient, alice: Actor, bob: Actor
):
    """Bob is a real member of his own org, but Alice's ids must not resolve under it."""
    project = make_project(client, alice)
    task = make_task(client, alice, project["id"])
    b = bob.org_id

    assert client.get(f"/api/orgs/{b}/projects/{project['id']}", headers=bob.headers).status_code == 404
    assert client.get(f"/api/orgs/{b}/tasks/{task['id']}", headers=bob.headers).status_code == 404
    r = client.patch(f"/api/orgs/{b}/tasks/{task['id']}", json={"title": "pwned"}, headers=bob.headers)
    assert r.status_code == 404
    r = client.post(
        f"/api/orgs/{b}/tasks/{task['id']}/move", json={"status": "done", "index": 0}, headers=bob.headers
    )
    assert r.status_code == 404
    r = client.post(f"/api/orgs/{b}/projects/{project['id']}/tasks", json={"title": "x"}, headers=bob.headers)
    assert r.status_code == 404
    assert client.delete(f"/api/orgs/{b}/tasks/{task['id']}", headers=bob.headers).status_code == 404

    # Nothing changed on Alice's side.
    still = client.get(f"/api/orgs/{alice.org_id}/tasks/{task['id']}", headers=alice.headers).json()
    assert still["title"] == "A task"
    assert still["status"] == "todo"


def test_outsider_cannot_write_into_another_organization(client: TestClient, alice: Actor, bob: Actor):
    a = alice.org_id
    assert (
        client.post(
            f"/api/orgs/{a}/projects", json={"name": "Evil", "key": "EVIL"}, headers=bob.headers
        ).status_code
        == 404
    )
    assert client.patch(f"/api/orgs/{a}", json={"name": "Owned"}, headers=bob.headers).status_code == 404
    r = client.post(f"/api/orgs/{a}/members", json={"email": bob.email, "role": "owner"}, headers=bob.headers)
    assert r.status_code == 404


def test_tasks_cannot_be_assigned_to_people_outside_the_organization(
    client: TestClient, alice: Actor, bob: Actor
):
    project = make_project(client, alice)
    r = client.post(
        f"/api/orgs/{alice.org_id}/projects/{project['id']}/tasks",
        json={"title": "x", "assignee_id": bob.user_id},
        headers=alice.headers,
    )
    assert r.status_code == 422


def test_stats_only_count_your_own_organization(client: TestClient, alice: Actor, bob: Actor):
    make_task(client, alice, make_project(client, alice)["id"])
    bob_project = make_project(client, bob, key="GLX")
    for _ in range(3):
        make_task(client, bob, bob_project["id"])

    assert client.get(f"/api/orgs/{alice.org_id}/stats", headers=alice.headers).json()["total_tasks"] == 1
    assert client.get(f"/api/orgs/{bob.org_id}/stats", headers=bob.headers).json()["total_tasks"] == 3
