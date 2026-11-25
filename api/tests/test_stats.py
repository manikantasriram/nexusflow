from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.conftest import Actor, make_project, make_task


def stats(client: TestClient, actor: Actor) -> dict:
    r = client.get(f"/api/orgs/{actor.org_id}/stats", headers=actor.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_dashboard_numbers(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    today = date.today()
    make_task(client, alice, p["id"], due_date=str(today - timedelta(days=2)), priority="urgent")  # overdue
    make_task(client, alice, p["id"], due_date=str(today + timedelta(days=3)))  # due this week
    make_task(
        client, alice, p["id"], due_date=str(today - timedelta(days=5)), status="done"
    )  # done: not overdue
    make_task(client, alice, p["id"], status="in_progress")

    s = stats(client, alice)
    assert s["total_tasks"] == 4
    assert s["by_status"] == {"todo": 2, "in_progress": 1, "in_review": 0, "done": 1}
    assert s["by_priority"]["urgent"] == 1
    assert s["overdue"] == 1
    assert s["due_this_week"] == 1
    assert s["completed_last_7_days"] == 1
    assert s["projects"] == [{"id": p["id"], "name": "Project WEB", "key": "WEB", "total": 4, "done": 1}]


def test_stats_are_cached_and_refreshed_after_a_change(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    first = stats(client, alice)
    assert first["cached"] is False
    second = stats(client, alice)
    assert second["cached"] is True
    assert second["total_tasks"] == 0

    make_task(client, alice, p["id"])  # any write throws the cached copy away
    third = stats(client, alice)
    assert third["cached"] is False
    assert third["total_tasks"] == 1
