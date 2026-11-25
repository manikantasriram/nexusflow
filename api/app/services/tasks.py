"""Tasks on a project's Kanban board.

Ordering: each task has a float `position` inside its column. Moving a card to index i puts it
halfway between its new neighbours, so a move writes one row. If neighbours ever get too close
for a float to split, that column is renumbered once (1024, 2048, ...) and the move continues.
"""

from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.deps import Tenant
from app.errors import AppError, not_found
from app.models import Priority, Project, Task, TaskStatus
from app.schemas import TaskIn, TaskUpdate
from app.services.orgs import is_member
from app.services.projects import get_project
from app.services.stats import invalidate_stats

GAP = 1024.0
MIN_GAP = 1e-6
NOT_NULL_FIELDS = ("title", "description", "status", "priority")


def list_tasks(
    db: Session,
    tenant: Tenant,
    project_id: int,
    *,
    status: TaskStatus | None = None,
    priority: Priority | None = None,
    assignee_id: int | None = None,
    q: str | None = None,
    limit: int = 1000,
) -> list[Task]:
    get_project(db, tenant, project_id)  # 404 if the project isn't in this organization
    stmt = select(Task).where(Task.organization_id == tenant.org_id, Task.project_id == project_id)
    if status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Task.title.icontains(q.strip(), autoescape=True))
    return list(db.scalars(stmt.order_by(Task.status, Task.position).limit(limit)))


def my_open_tasks(db: Session, tenant: Tenant, limit: int = 50) -> list[Task]:
    stmt = (
        select(Task)
        .options(joinedload(Task.project))
        .where(
            Task.organization_id == tenant.org_id,
            Task.assignee_id == tenant.user.id,
            Task.status != TaskStatus.DONE,
        )
        .order_by(Task.due_date.asc().nulls_last(), Task.created_at)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def get_task(db: Session, tenant: Tenant, task_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.organization_id == tenant.org_id))
    if task is None:
        raise not_found("Task")
    return task


def _check_assignee(db: Session, tenant: Tenant, assignee_id: int | None) -> None:
    if assignee_id is not None and not is_member(db, tenant.org_id, assignee_id):
        raise AppError(422, "The assignee must be a member of this organization", code="validation_error")


def _end_of_column(db: Session, task_project_id: int, org_id: int, status: TaskStatus) -> float:
    last = db.scalar(
        select(func.max(Task.position)).where(
            Task.organization_id == org_id, Task.project_id == task_project_id, Task.status == status
        )
    )
    return (last or 0.0) + GAP


def _set_status(task: Task, status: TaskStatus) -> None:
    if status == TaskStatus.DONE and task.status != TaskStatus.DONE:
        task.completed_at = datetime.now(UTC)
    elif status != TaskStatus.DONE:
        task.completed_at = None
    task.status = status


def create_task(db: Session, tenant: Tenant, project_id: int, data: TaskIn) -> Task:
    project = get_project(db, tenant, project_id)
    _check_assignee(db, tenant, data.assignee_id)
    # Atomic "counter + 1, give me the new value": two simultaneous creates can't get the same number.
    number = db.execute(
        update(Project)
        .where(Project.id == project.id)
        .values(task_counter=Project.task_counter + 1)
        .returning(Project.task_counter)
    ).scalar_one()
    task = Task(
        organization_id=tenant.org_id,
        project_id=project.id,
        number=number,
        title=data.title,
        description=data.description,
        status=TaskStatus.TODO,
        priority=data.priority,
        assignee_id=data.assignee_id,
        due_date=data.due_date,
        position=_end_of_column(db, project.id, tenant.org_id, data.status),
        created_by_id=tenant.user.id,
    )
    _set_status(task, data.status)
    task.project = project
    db.add(task)
    db.flush()
    invalidate_stats(tenant.org_id)
    return task


def update_task(db: Session, tenant: Tenant, task_id: int, data: TaskUpdate) -> Task:
    task = get_task(db, tenant, task_id)
    changes = data.model_dump(exclude_unset=True)
    for field in NOT_NULL_FIELDS:
        if field in changes and changes[field] is None:
            raise AppError(422, f"{field} can't be empty", code="validation_error")
    if "assignee_id" in changes:
        _check_assignee(db, tenant, changes["assignee_id"])
    new_status = changes.pop("status", None)
    if new_status is not None and new_status != task.status:
        task.position = _end_of_column(db, task.project_id, tenant.org_id, new_status)
        _set_status(task, new_status)
    for field, value in changes.items():
        setattr(task, field, value)
    db.flush()
    invalidate_stats(tenant.org_id)
    return task


def _column(db: Session, task: Task, status: TaskStatus) -> list[Task]:
    return list(
        db.scalars(
            select(Task)
            .where(
                Task.organization_id == task.organization_id,
                Task.project_id == task.project_id,
                Task.status == status,
                Task.id != task.id,
            )
            .order_by(Task.position, Task.id)
        )
    )


def _position_at(column: list[Task], index: int) -> float | None:
    """The position for slot `index`, or None if the neighbours are too close to split."""
    before = column[index - 1].position if index > 0 else None
    after = column[index].position if index < len(column) else None
    if before is None and after is None:
        return GAP
    if before is None:
        return after - GAP  # type: ignore[operator]
    if after is None:
        return before + GAP
    if after - before < MIN_GAP:
        return None
    return (before + after) / 2


def move_task(db: Session, tenant: Tenant, task_id: int, status: TaskStatus, index: int) -> Task:
    task = get_task(db, tenant, task_id)
    column = _column(db, task, status)
    index = min(index, len(column))
    position = _position_at(column, index)
    if position is None:
        for i, other in enumerate(column, start=1):
            other.position = i * GAP
        position = _position_at(column, index)
    task.position = position  # type: ignore[assignment]
    _set_status(task, status)
    db.flush()
    invalidate_stats(tenant.org_id)
    return task


def delete_task(db: Session, tenant: Tenant, task_id: int) -> None:
    db.delete(get_task(db, tenant, task_id))
    db.flush()
    invalidate_stats(tenant.org_id)
