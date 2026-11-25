import io

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.services.text_analysis import action_items, analyze
from tests.conftest import Actor, make_project

NOTES = b"""# Launch planning meeting

The launch of the mobile app moves to March. The mobile app needs a final security review before launch.
Marketing will prepare the launch campaign for the mobile app. Budget for the campaign is approved.
We talked about the weather for a while, which was pleasant.

- [ ] Book the security review with the external auditor
TODO: Update the launch checklist
Action item: Draft the press release
- [x] Already finished item
"""


def upload(
    client: TestClient, actor: Actor, project_id: int, name: str, data: bytes, ctype: str = "text/plain"
):
    return client.post(
        f"/api/orgs/{actor.org_id}/projects/{project_id}/documents",
        files={"file": (name, io.BytesIO(data), ctype)},
        headers=actor.headers,
    )


def test_analysis_finds_keywords_summary_and_action_items():
    result = analyze(NOTES.decode())
    assert result.keywords[:3] == ["launch", "mobile", "app"]
    assert "security review" in result.summary
    assert "weather" not in result.summary  # the off-topic sentence scores lowest
    assert result.action_items == [
        "Book the security review with the external auditor",
        "Update the launch checklist",
        "Draft the press release",
    ]


def test_a_sentence_wrapped_over_two_lines_stays_one_sentence():
    text = "# Notes\n\nThe pricing page is the main\nblocker for the whole launch this month.\n"
    summary = analyze(text).summary
    assert "the main blocker for the whole launch" in summary
    assert "main." not in summary


def test_action_items_are_deduplicated_and_ticked_boxes_ignored():
    assert action_items("TODO: ship it\n- [ ] Ship it\n- [x] done already\nTodo - write tests") == [
        "ship it",
        "write tests",
    ]


def test_upload_analyses_the_document(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    r = upload(client, alice, p["id"], "notes.md", NOTES)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["filename"] == "notes.md"
    assert doc["word_count"] > 50
    assert len(doc["action_items"]) == 3
    assert doc["text_preview"].startswith("# Launch planning")

    listed = client.get(
        f"/api/orgs/{alice.org_id}/projects/{p['id']}/documents", headers=alice.headers
    ).json()
    assert [d["id"] for d in listed] == [doc["id"]]
    assert "text_preview" not in listed[0]


def test_action_items_become_tasks(client: TestClient, alice: Actor):
    p = make_project(client, alice)
    doc = upload(client, alice, p["id"], "notes.md", NOTES).json()
    r = client.post(
        f"/api/orgs/{alice.org_id}/documents/{doc['id']}/tasks",
        json={"items": doc["action_items"][:2]},
        headers=alice.headers,
    )
    assert r.status_code == 201
    assert [t["key"] for t in r.json()] == ["WEB-1", "WEB-2"]
    assert r.json()[0]["description"] == "Created from the document “notes.md”."


def test_unsupported_empty_and_oversized_files_are_refused(
    client: TestClient, alice: Actor, monkeypatch: pytest.MonkeyPatch
):
    p = make_project(client, alice)
    assert upload(client, alice, p["id"], "photo.png", b"\x89PNG....", "image/png").status_code == 415
    assert upload(client, alice, p["id"], "empty.txt", b"").status_code == 422
    assert upload(client, alice, p["id"], "fake.pdf", b"not a pdf", "application/pdf").status_code == 422

    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1_000)
    assert upload(client, alice, p["id"], "big.txt", b"word " * 400).status_code == 413


def test_only_the_uploader_or_an_admin_can_delete(client: TestClient, alice: Actor):
    from tests.conftest import join

    dave = Actor(client, "dave@acme.dev", "Dave's own")
    join(client, alice, dave, "member")
    p = make_project(client, alice)
    doc = upload(client, alice, p["id"], "notes.txt", NOTES).json()
    url = f"/api/orgs/{alice.org_id}/documents/{doc['id']}"
    assert client.delete(url, headers=dave.headers).status_code == 403
    assert client.delete(url, headers=alice.headers).status_code == 204
