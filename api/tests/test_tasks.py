from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Task
from tests.conftest import Actor, make_project, make_task


def board(client: TestClient, actor: Actor, project_id: int, **params) -> list[dict]:
    r = client.get(
        f"/api/orgs/{actor.org_id}/projects/{project_id}/tasks", params=params, headers=actor.headers
    )
    assert r.status_code == 200, r.text
    return r.json()


def column(client: TestClient, actor: Actor, project_id: int, status: str) -> list[str]:
    return [t["title"] for t in board(client, actor, project_id) if t["status"] == status]


def move(client: TestClient, actor: Actor, task_id: int, status: str, index: int) -> dict:
    r = client.post(
        f"/api/orgs/{actor.org_id}/tasks/{task_id}/move",
        json={"status": status, "index": index},
        headers=actor.headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_tasks_get_sequential_keys_per_project(client: TestClient, alice: Actor):
    web = make_project(client, alice, "WEB")
    ops = make_project(client, alice, "OPS")
    assert make_task(client, alice, web["id"])["key"] == "WEB-1"
    assert make_task(client, alice, web["id"])["key"] == "WEB-2"
    assert make_task(client, alice, ops["id"])["key"] == "OPS-1"


def test_new_tasks_go_to_the_bottom_of_their_column(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    for title in ("first", "second", "third"):
        make_task(client, alice, p["id"], title=title)
    assert column(client, alice, p["id"], "todo") == ["first", "second", "third"]


def test_moving_inside_and_between_columns(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    a, b, c = (make_task(client, alice, p["id"], title=t) for t in "abc")

    move(client, alice, c["id"], "todo", 0)
    assert column(client, alice, p["id"], "todo") == ["c", "a", "b"]

    move(client, alice, a["id"], "todo", 1)  # index counts the column without the moving card
    assert column(client, alice, p["id"], "todo") == ["c", "a", "b"]

    move(client, alice, a["id"], "in_progress", 0)
    move(client, alice, b["id"], "in_progress", 99)  # past the end means "last"
    assert column(client, alice, p["id"], "todo") == ["c"]
    assert column(client, alice, p["id"], "in_progress") == ["a", "b"]


def test_moving_to_done_records_completion(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    t = make_task(client, alice, p["id"])
    assert t["completed_at"] is None
    assert move(client, alice, t["id"], "done", 0)["completed_at"] is not None
    assert move(client, alice, t["id"], "todo", 0)["completed_at"] is None


def test_a_crowded_column_is_renumbered_when_positions_run_out(client: TestClient, alice: Actor, db: Session):
    p = make_project(client, alice)
    tasks = [make_task(client, alice, p["id"], title=t) for t in "abc"]
    # Squeeze a and b so close together that no float fits between them.
    for task, pos in zip(tasks[:2], (1.0, 1.0 + 1e-9), strict=True):
        db.get(Task, task["id"]).position = pos
    db.commit()

    move(client, alice, tasks[2]["id"], "todo", 1)
    assert column(client, alice, p["id"], "todo") == ["a", "c", "b"]
    positions = list(db.scalars(select(Task.position).order_by(Task.position)))
    assert positions[1] - positions[0] > 1


def test_update_changes_only_the_fields_sent(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    t = make_task(client, alice, p["id"], title="Old", priority="high", assignee_id=alice.user_id)
    url = f"/api/orgs/{alice.org_id}/tasks/{t['id']}"

    r = client.patch(url, json={"title": "New"}, headers=alice.headers).json()
    assert (r["title"], r["priority"], r["assignee_id"]) == ("New", "high", alice.user_id)

    r = client.patch(url, json={"assignee_id": None}, headers=alice.headers).json()
    assert r["assignee_id"] is None

    r = client.patch(url, json={"title": None}, headers=alice.headers)
    assert r.status_code == 422


def test_changing_status_by_update_moves_the_card_to_the_end_of_that_column(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    make_task(client, alice, p["id"], title="already done", status="done")
    t = make_task(client, alice, p["id"], title="finish me")
    client.patch(f"/api/orgs/{alice.org_id}/tasks/{t['id']}", json={"status": "done"}, headers=alice.headers)
    assert column(client, alice, p["id"], "done") == ["already done", "finish me"]


def test_filters(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    make_task(client, alice, p["id"], title="Fix login bug", priority="urgent")
    make_task(client, alice, p["id"], title="Write docs", priority="low", assignee_id=alice.user_id)
    make_task(client, alice, p["id"], title="100% coverage", priority="low")

    assert [t["title"] for t in board(client, alice, p["id"], q="login")] == ["Fix login bug"]
    assert [t["title"] for t in board(client, alice, p["id"], q="%")] == [
        "100% coverage"
    ]  # escaped, not a wildcard
    assert len(board(client, alice, p["id"], priority="low")) == 2
    assert [t["title"] for t in board(client, alice, p["id"], assignee_id=alice.user_id)] == ["Write docs"]


def test_my_tasks_lists_open_tasks_assigned_to_me_soonest_first(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    make_task(client, alice, p["id"], title="later", assignee_id=alice.user_id, due_date="2030-05-01")
    make_task(client, alice, p["id"], title="no date", assignee_id=alice.user_id)
    make_task(client, alice, p["id"], title="sooner", assignee_id=alice.user_id, due_date="2030-01-01")
    make_task(client, alice, p["id"], title="finished", assignee_id=alice.user_id, status="done")
    make_task(client, alice, p["id"], title="someone else's")

    mine = client.get(f"/api/orgs/{alice.org_id}/tasks/mine", headers=alice.headers).json()
    assert [t["title"] for t in mine] == ["sooner", "later", "no date"]


def test_delete(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    t = make_task(client, alice, p["id"])
    url = f"/api/orgs/{alice.org_id}/tasks/{t['id']}"
    assert client.delete(url, headers=alice.headers).status_code == 204
    assert client.get(url, headers=alice.headers).status_code == 404


def test_project_keys_are_validated_and_unique(client: TestClient, alice: Actor):
    url = f"/api/orgs/{alice.org_id}/projects"
    assert client.post(url, json={"name": "Web", "key": "web"}, headers=alice.headers).json()["key"] == "WEB"
    assert client.post(url, json={"name": "Web 2", "key": "WEB"}, headers=alice.headers).status_code == 409
    r = client.post(url, json={"name": "Bad", "key": "1X"}, headers=alice.headers)
    assert r.status_code == 422
    assert "key" in r.json()["error"]["fields"]


def test_project_list_includes_progress(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    make_task(client, alice, p["id"], status="done")
    make_task(client, alice, p["id"])
    [listed] = client.get(f"/api/orgs/{alice.org_id}/projects", headers=alice.headers).json()
    assert (listed["task_count"], listed["done_count"]) == (2, 1)
