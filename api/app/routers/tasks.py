"""Kanban tasks."""

from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.deps import DB, OrgMember
from app.models import Priority, TaskStatus
from app.schemas import TaskIn, TaskMoveIn, TaskOut, TaskUpdate
from app.services import tasks

router = APIRouter(prefix="/api/orgs/{org_id}", tags=["tasks"])


@router.get("/projects/{project_id}/tasks")
def list_tasks(
    project_id: int,
    tenant: OrgMember,
    db: DB,
    status: TaskStatus | None = None,
    priority: Priority | None = None,
    assignee_id: int | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 1000,
) -> list[TaskOut]:
    found = tasks.list_tasks(
        db, tenant, project_id, status=status, priority=priority, assignee_id=assignee_id, q=q, limit=limit
    )
    return [TaskOut.model_validate(t) for t in found]


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(project_id: int, data: TaskIn, tenant: OrgMember, db: DB) -> TaskOut:
    task = tasks.create_task(db, tenant, project_id, data)
    db.commit()
    return TaskOut.model_validate(task)


# Declared before /tasks/{task_id} so "mine" isn't read as a task id.
@router.get("/tasks/mine")
def my_tasks(tenant: OrgMember, db: DB) -> list[TaskOut]:
    return [TaskOut.model_validate(t) for t in tasks.my_open_tasks(db, tenant)]


@router.get("/tasks/{task_id}")
def get_task(task_id: int, tenant: OrgMember, db: DB) -> TaskOut:
    return TaskOut.model_validate(tasks.get_task(db, tenant, task_id))


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, tenant: OrgMember, db: DB) -> TaskOut:
    task = tasks.update_task(db, tenant, task_id, data)
    db.commit()
    return TaskOut.model_validate(task)


@router.post("/tasks/{task_id}/move")
def move_task(task_id: int, data: TaskMoveIn, tenant: OrgMember, db: DB) -> TaskOut:
    task = tasks.move_task(db, tenant, task_id, data.status, data.index)
    db.commit()
    return TaskOut.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, tenant: OrgMember, db: DB) -> Response:
    tasks.delete_task(db, tenant, task_id)
    db.commit()
    return Response(status_code=204)
